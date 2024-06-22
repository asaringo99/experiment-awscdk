# Step 1: Build the React app
FROM node:20 AS build

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the React app
RUN npm run build

# Step 2: Serve the React app with nginx
FROM nginx:alpine

# Remove the default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy the build output to the nginx html directory
COPY --from=build /usr/src/app/build /usr/share/nginx/html

# Expose the port that nginx will serve on
EXPOSE 80

# Start nginx when the container starts
CMD ["nginx", "-g", "daemon off;"]
