const { app, ipcMain } = require("electron");
const { destroy } = require("./front");

module.exports = (win) => {
	app.on("window-all-closed", destroy);

	// ipcRenderer can't send events to itself, so we forward the event back to the frontend
	ipcMain.on("playPaused", (_, event) => {
		win.webContents.send("playPaused", event);
	});
};
