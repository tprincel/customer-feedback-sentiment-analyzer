# Base image with Python and Node.js pre-installed
FROM nikolaik/python-nodejs:python3.10-nodejs18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Expose port and start app
EXPOSE 3000
CMD ["node", "server.js"]