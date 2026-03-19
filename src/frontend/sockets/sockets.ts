"use client";

import { Manager } from "socket.io-client";

let manager: Manager | null = null;
let podTerminalSocketInstance: ReturnType<Manager['socket']> | null = null;

export const getPodTerminalSocket = () => {
    if (!manager) {
        manager = new Manager({
            autoConnect: false // Prevent automatic connection until needed
        });
    }
    if (!podTerminalSocketInstance) {
        podTerminalSocketInstance = manager.socket("/pod-terminal");
        podTerminalSocketInstance.connect(); // Explicitly connect when socket is created
    }
    return podTerminalSocketInstance;
};