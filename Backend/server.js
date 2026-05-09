
import "dotenv/config"
import app from './src/app.js';
import http from "http";
import connectDB from './config/db.js';
import { initSocket } from "./socket/socket.js";

const PORT = process.env.PORT || 3000;
const httpServer = http.createServer(app)
initSocket(httpServer)
connectDB()

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
