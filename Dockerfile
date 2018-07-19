FROM node:8
COPY . /scripture-cite
RUN cd /scripture-cite/ && \
    npm install && \
    npm run build
EXPOSE 3000
WORKDIR /scripture-cite
CMD [ "npm", "start" ]