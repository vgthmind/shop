FROM node:20-slim
# Modèle BiRefNet lite (licence MIT), téléchargé une fois à la construction de l'Espace.
ADD https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx /app/models/model.onnx
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
RUN chown -R node:node /app
USER node
ENV PORT=7860
EXPOSE 7860
CMD ["node", "server.js"]
