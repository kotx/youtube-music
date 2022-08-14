const { ipcRenderer, clipboard } = require("electron");
const getSongControls = require("../../providers/song-controls");

let Peer;

/**
 * @type {import('peerjs').Peer?}
 */
let peer = null;

/**
 * @type {Object.<string, {peerId: string, label: string}>}
 */
let connections = {};

let songInfo;

const info = {
	id: null,
	hostId: null,
	hostMode: true,
	guestCount: () => Object.keys(connections).length,
};

const destroyPeer = () => {
	if (peer) {
		peer.destroy();
		peer = null;
	}

	connections = {};
	ipcRenderer.send("listen-along-connections", connections);

	Object.assign(info, { id: null, hostId: null });
};

const setupPeer = () => {
	if (!Peer) Peer = require("peerjs").Peer;
	if (!peer) peer = new Peer();
	peer.removeAllListeners();

	connections = {};
	ipcRenderer.send("listen-along-connections", connections);

	peer.on("open", (id) => {
		console.log("Listen Along:", "connected to PeerServer", peer);
		info.id = id;
	});

	peer.on("close", () => {
		console.log("Listen Along:", "disconnected from PeerServer:", peer);
	});

	peer.on("error", (error) => {
		console.error("Listen Along:", error);

		if (peer.disconnected) {
			if (peer.destroyed)
				console.log("Listen Along:", "peer is destroyed, not reconnecting");
			else {
				console.log("Listen Along:", "attempting to reconnect");
				peer.reconnect();
			}
		}
	});
};

const setupHost = () => {
	info.hostMode = true;
	setupPeer();

	peer.on("connection", (conn) => {
		connections[conn.connectionId] = {
			peerId: conn.peer,
			label: conn.label,
		};
		console.log("Listen Along:", "peer connected:", conn.label, conn);
		console.log("Listen Along:", "connections:", connections);
		ipcRenderer.send("listen-along-connections", connections);

		conn.on("open", () => {
			if (songInfo) {
				// TODO: retrieve these values some other way without code duplication?
				const video = document.querySelector("video");
				songInfo.elapsedSeconds = Math.floor(video.currentTime);
				songInfo.isPaused = video.paused;

				updatePeer(conn.peer, conn.connectionId, {
					type: "songInfo",
					event: songInfo,
				});
			}
		});

		conn.on("close", () => {
			delete connections[conn.connectionId];
			console.log("Listen Along:", "peer disconnected:", conn.label, conn);
			console.log("Listen Along:", "connections:", connections);
			ipcRenderer.send("listen-along-connections", connections);
		});
	});
};

const setupGuest = (hostId) => {
	info.hostId = hostId;
	info.hostMode = false;
	setupPeer();

	let conn = peer.connect(info.hostId);

	conn.on("open", () => {
		console.log("Listen Along:", "connected to host");
	});

	conn.on("data", (data) => {
		console.log("Listen Along:", "guest mode received data:", data);

		const video = document.querySelector("video");

		if (data.event.isPaused !== video.paused) {
			if (video.paused) video.play();
			else video.pause();
		}

		const targetElapsed = Math.min(
			Math.max(0, data.event.elapsedSeconds),
			video.duration
		);

		const difference = targetElapsed - video.currentTime;
		const threshold = 1;
		if (Math.abs(difference) > threshold) {
			video.currentTime = targetElapsed;
		}

		if (data.type === "songInfo") {
			const url = new URL(window.location);
			const search = url.searchParams;
			if (
				search.get("watch") !== data.event.videoId ||
				search.get("list") !== data.event.playlistId
			) {
				const event = new Event("yt-navigate");

				event.detail = {
					musicEndpoint: {
						videoId: data.event.videoId,
						playlistId: data.event.playlistId,

						isAuthenticationRequired: () => false,
						isModalEndpoint: () => false,
						getCsiAction: () => "watch",
						getCsiInfo: () => {},
						// l.toCommand = function() {
						//         return {
						//             watchEndpoint: this.data,
						//             clickTrackingParams: this.clickTrackingParams
						//         }
						//     }
						//     ;
						//     l.getUrl = function() {
						//         return this.data.playlistId ? "watch?v=" + this.data.videoId + "&list=" + this.data.playlistId : "watch?v=" + this.data.videoId
						//     }
						//     ;
						//     l.JSC$9320_getVeType = function() {
						//         return 3832
						//     }
						//     ;
						//     l.JSC$9320_getHelpContextId = function() {
						//         return "music_web_watch"
						//     }
						//     ;
						//     l.getPlayerMode = function() {
						//         return B("watchEndpointMusicSupportedConfigs.watchEndpointMusicConfig.suggestedInitialPlayerMode", this.data)
						//     }
						//     ;
						//     l.getPreferredPlaybackContentMode = function() {
						//         var a = B("watchEndpointMusicSupportedConfigs.watchEndpointMusicConfig.musicPlaylistContentType", this.data);
						//         if (null != a && "MUSIC_PLAYLIST_CONTENT_TYPE_UNKNOWN" !== a)
						//             return "MUSIC_PLAYLIST_CONTENT_TYPE_OMV_PREFERRED" === a ? "OMV_PREFERRED" : "ATV_PREFERRED";
						//         a = B("watchEndpointMusicSupportedConfigs.watchEndpointMusicConfig.musicVideoType", this.data);
						//         return null === a ? "NONE" : "MUSIC_VIDEO_TYPE_ATV" !== a && "MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK" !== a ? "OMV_PREFERRED" : "ATV_PREFERRED"
						//     }
						//     ;
					},
				};

				document.dispatchEvent(event);
				// document.addEventListener("apiReady", () => {
				// 	if (data.event.isPaused) document.querySelector("video").pause();
				// });
			}
		}
	});
};

const updatePeer = (peerId, connId, event) => {
	const conn = peer.getConnection(peerId, connId);
	console.debug("Listen Along:", "Sending event", event, "to peer", peerId);
	if (conn) conn.send(event);
};

const updatePeers = (event) => {
	for (const [connId, info] of Object.entries(connections)) {
		updatePeer(info.peerId, connId, event);
	}
};

module.exports = () => {
	ipcRenderer.on("update-song-info", (_, newSongInfo) => {
		songInfo = JSON.parse(newSongInfo);
		updatePeers({
			type: "songInfo",
			event: {
				elapsedSeconds: songInfo.elapsedSeconds,
				isPaused: songInfo.isPaused,
				playlistId: songInfo.playlistId,
				songDuration: songInfo.songDuration,
				url: songInfo.url,
				videoId: songInfo.videoId,
			},
		});
	});

	ipcRenderer.on("playPaused", (_, event) => {
		updatePeers({ type: "playback", event });
	});

	ipcRenderer.on("listen-along-mode", (_, event) => {
		console.log("Listen Along:", "changing mode", event);
		if (event.mode === "host") {
			setupHost();
		} else if (event.mode === "guest") {
			setupGuest(event.id);
		}
	});

	ipcRenderer.on("listen-along-copy-id", () => {
		clipboard.writeText(info.id);
	});

	if (info.hostMode) setupHost();
};

module.exports.destroy = destroyPeer;
module.exports.info = info;
