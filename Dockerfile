FROM node:8.9.0

WORKDIR /probot-app-migrations

COPY package.json yarn.lock /probot-app-migrations/

RUN yarn
