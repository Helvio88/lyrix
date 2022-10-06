import LyricsSearcher from 'lyrics-searcher'
import fs from 'fs/promises'
import ytdl from 'ytdl-core'
import path from 'path'
import streamToPromise from 'stream-to-promise'
import exec from '@simplyhexagonal/exec'
import { Axios, AxiosRequestConfig } from 'axios'
import FormData from 'form-data'
import { Response } from 'express'

export const getGeniusSong = async function (geniusId: number | string, res: Response) {
  if (typeof geniusId === 'string') {
    geniusId = Number.parseInt(geniusId)
  }
  const output: string = process.env.KARAOKE_OUTPUT || '/media/karaoke'
  const geniusApi = process.env.GENIUS_API || ''
  const header: AxiosRequestConfig = { headers: {'Authorization': `Bearer ${geniusApi}`} }
  const axios = new Axios(header)

  try {
    // Get Track information from Genius and extract Artist, Song and URL
    const geniusResponse = await axios.get(`https://api.genius.com/songs/${geniusId}`)
    
    // Reject invalid requests
    if (geniusResponse.status !== 200) {
      res.status(geniusResponse.status)
      switch (geniusResponse.status) {
        case 401:
          res.end(`Genius API Key is Invalid: ${geniusApi}\nPlease provide a valid key through env var GENIUS_API`)
          break
        case 404:
          res.end(`Song with ID ${geniusId} not found.`)
          break
        default:
          res.end(geniusResponse)
      }
      return
    }
    const track = JSON.parse(geniusResponse.data).response.song
    const youtube = track.media.find((m: { provider: string, url: string }) => m.provider === 'youtube')
    const artist = track.primary_artist.name
    const song = track.title
    if (!youtube) {
      res.status(406).end(`No YouTube link available for ${artist} - ${song}. Unable to continue.`)
      return
    }

    // All prerequisites look good
    console.log(`Starting to process ${artist} - ${song}`)

    // Downloading lyrics
    console.log('Fetching Lyrics')
    const lyrics = (await LyricsSearcher(artist, song)).replaceAll('\n', '\r\n')
    if (!lyrics) {
      res.status(404).end(`Lyrics for ${artist} - ${song} not found.`)
      return
    }
    console.log('Lyrics Found')
  
    // All file names
    const videoFile = path.join(output, `${artist} - ${song}.mov`)
    const audioFile = path.join(output, `${artist} - ${song}.webm`)
    const assFile = path.join(output, `${artist} - ${song}.ass`)
    const karaokeFile = path.join(output, `${artist} - ${song}.mp4`)
    const vocalsFile = path.join(output, `${artist} - ${song}_Vocals.wav`)
    const instrumentsFile = path.join(output, `${artist} - ${song}_Instruments.wav`)

    // Download all base files
    console.log('Downloading Video')
    await fs.writeFile(videoFile, await streamToPromise(ytdl(youtube.url, { quality: 'highest', filter: 'videoonly' })))
    console.log('Downloading Audio')
    await fs.writeFile(audioFile, await streamToPromise(ytdl(youtube.url, { quality: 'highest', filter: 'audioonly' })))

    console.log('Splitting Instruments and Vocals')
    {
      const cmd = `(cd /vocal-remover && python /vocal-remover/inference.py -i "${audioFile}" -o "${output}")`
      console.log(cmd)
      const { execProcess, execPromise } = exec(cmd)
      await execPromise
    }
  
    console.log('Joining Video and Audio tracks')
    {
      const cmd = `ffmpeg \
                  -i "${videoFile}" \
                  -i "${instrumentsFile}" \
                  -i "${vocalsFile}" \
                  -i "${audioFile}" \
                  -map 0:v -map 1:a -map 2:a -map 3:a \
                  -map_metadata -1 \
                  -metadata:s:a:0 Title=Instruments \
                  -metadata:s:a:1 Title=Vocals \
                  -metadata:s:a:2 Title=All \
                  -c:v copy -c:a aac \
                  -y "${karaokeFile}"`
      const { execProcess, execPromise } = exec(cmd)
      await execPromise
      await fs.unlink(videoFile)
      await fs.unlink(vocalsFile)
      await fs.unlink(instrumentsFile)
    }

    console.log('Aligning Lyrics')
    const form = new FormData()
    form.append('lyrics', lyrics)
    form.append('format', 'ass')
    form.append('audio_file', await fs.readFile(audioFile), `${artist} - ${song}.webm`)
    await fs.unlink(audioFile)
    await fs.writeFile(assFile, (await axios.post('http://127.0.0.1:3000/align', form)).data)

    console.log('All done!')
    res.status(200).end(`${artist} - ${song} is ready to sing! Please refresh your library!`)
  } catch (error) {
    console.error(error)
    res.json(error).end()
  }
}