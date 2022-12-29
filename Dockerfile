FROM helvio/kaldi:latest
WORKDIR /usr/src/app
ADD ["tmp/dist.js", "src/index.html", "/usr/src/app/"]
EXPOSE 3000
ENTRYPOINT ["node"]
CMD ["dist.js"]
