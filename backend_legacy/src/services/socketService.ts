
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initSocket = (server: HttpServer) => {
    io = new Server(server, {
        cors: {
            origin: "*", // Adjust for production
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('join_line', (line: string) => {
            socket.join(line);
            console.log(`Socket ${socket.id} joined line: ${line}`);
        });

        socket.on('report_alert', (data) => {
            // data: { type, lat, lng, line, description... }
            console.log('Alert received:', data);

            // Broadcast to same line
            if (data.line) {
                // In production: add geofencing filter here
                io.to(data.line).emit('new_alert', data);
            } else {
                io.emit('new_alert', data);
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};
