"use strict";
const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
let mainWindow;
let pythonProcess;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function startPythonBackend() {
  const pythonScript = path.join(__dirname, "../backend/main.py");
  pythonProcess = spawn("python", [pythonScript]);
  pythonProcess.stdout.on("data", (data) => {
    console.log(`Python: ${data}`);
  });
  pythonProcess.stderr.on("data", (data) => {
    console.error(`Python Error: ${data}`);
  });
}
app.on("ready", () => {
  startPythonBackend();
  createWindow();
});
app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
