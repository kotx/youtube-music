const prompt = require("custom-electron-prompt");

const { setMenuOptions } = require("../../config/plugins");
const promptOptions = require("../../providers/prompt-options");
const { info } = require("./front");
const { app, ipcMain, clipboard } = require("electron");

let hostConns = {};
let hasRegisterred = false;

module.exports = (win, options, refreshMenu) => {
	if (!hasRegisterred) {
		ipcMain.on("listen-along-connections", (_, connections) => {
			hostConns = connections;
			refreshMenu();
		});
		hasRegisterred = true;
	}

	return [
		{
			label: info.hostMode
				? `Host Mode: ${Object.keys(hostConns).length} connected`
				: "Guest Mode",
			enabled: false,
		},
		{
			label: info.hostMode ? "Listen along" : "Stop listening along",
			click: async (item) => {
				if (info.hostMode) {
					const output = await prompt({
						title: "Listen Along",
						label: "Enter Host ID to listen along to:",
						width: 450,
						...promptOptions(),
					});

					if (output) {
						win.webContents.send("listen-along-mode", {
							mode: "guest",
							id: output,
						});
					}
				} else {
					win.webContents.send("listen-along-mode", { mode: "host" });
				}

				refreshMenu();
			},
		},
		{
			label: "Copy ID",
			enabled: info.id,
			click: (item) => {
				win.webContents.send("listen-along-copy-id");
			},
		},
	];
};
