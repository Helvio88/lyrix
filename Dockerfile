FROM ubuntu:latest
WORKDIR /usr/src/app
COPY ["align.js", "index.ts", "index.html", "package.json", "/usr/src/app/"]
RUN apt update && apt -y install ffmpeg nodejs zlib1g-dev wget python3 python2 python3-pip dos2unix git automake autoconf unzip sox gfortran libtool subversion npm
RUN npm install && tsc
RUN pip3 install pydub scipy gdown
RUN gdown 1EkAjl_jX3z9pSigykyLzQw5nCsukekAn && tar -xf NUSAutoLyrixAlign-patched.tar.gz && rm NUSAutoLyrixAlign-patched.tar.gz
RUN git clone https://github.com/kaldi-asr/kaldi.git kaldi --origin upstream
RUN (cd kaldi/tools && make -j `nproc` >/dev/null)
RUN (cd kaldi/tools && extras/install_irstlm.sh)
RUN (cd kaldi/tools && extras/install_mkl.sh)
RUN (cd kaldi/src && ./configure --shared)
RUN (cd kaldi/src && make depend -j `nproc` >/dev/null)
RUN (cd kaldi/src && make -j `nproc` >/dev/null)
RUN ln -s /usr/bin/python3 /usr/bin/python
EXPOSE 3000
ENTRYPOINT ["node","index.js"]
