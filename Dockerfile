FROM node:20-slim
WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node package*.json ./
USER node
RUN npm install --omit=dev
COPY --chown=node:node . .
ENV PORT=7860
EXPOSE 7860
CMD ["npm", "start"]
