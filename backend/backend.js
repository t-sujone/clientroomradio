
var users = {};
var tracks = [];
var skippers = [];
var player;
var currentStation = '';
var _ = require("underscore");
var config = require("../config.js");
var fs = require("fs");
var rebus = require('rebus');
var http = require('http');

var LastFmNode = require('lastfm').LastFmNode;

if ( !fs.existsSync('../rebus-storage') ) {
	fs.mkdirSync('../rebus-storage');
	fs.writeFileSync('../rebus-storage/users.json', "{}");
	fs.writeFileSync('../rebus-storage/skippers.json', "[]");
	fs.writeFileSync('../rebus-storage/currentTrack.json', "{}");
}

var vlc = require('vlc')([
  '-I', 'dummy',
  '-V', 'dummy',
  '--verbose', '1',
  '--sout=#http{dst=:8080/stream.mp3}'
]);

var lastfm = new LastFmNode({
	api_key: config.api_key,
	secret: config.secret,
	useragent: 'clientroomradio/v0.1 Client Room Radio'
});

function doUpdateNowPlaying(username, session_key, track) {
	var request = lastfm.request("track.updateNowPlaying", {
		album: track.album,
		track: track.title,
		artist: track.creator,
		duration: (track.duration / 1000),
		sk: session_key,
		handlers: {
			success: function(lfm) {
				console.log("Updated now playing for:", username);
			},
			error: function(error) {
				console.log("Now playing error:" + error.message);
			}
		}
	});
}

function updateNowPlaying(track) {
	// always scrobble to clientroom
	doUpdateNowPlaying("clientroom", config.sk, track);

	_.each(users, function(data, user) {
		if ( user.scrobbling ) {
			doUpdateNowPlaying(user, data.sk, track);
		}
	});
}

function doScrobble(username, session_key, track) {
	var request = lastfm.request("track.scrobble", {
		"album[0]": track.album,
		"track[0]": track.title,
		"artist[0]": track.creator,
		"timestamp[0]": Math.round(track.timestamp / 1000),
		"duration[0]": Math.round(track.duration / 1000),
		sk: session_key,
		"streamid[0]": track.extension.streamid,
		"chosenByUser[0]": "0",
		handlers: {
			success: function(lfm) {
				console.log("Scrobbled track for:", username);
			},
			error: function(error) {
				console.log("Scrobble error:" + error.message);
			}
		}
	});
}

function scrobble(track) {
	if ( new Date().getTime() - track.timestamp > Math.round( track.duration / 2 ) ) {
		// we've listened to more than half the song
		doScrobble("clientroom", config.sk, track);

		_.each(users, function(data, user) {
			if ( user.scrobbling && !_.contains(_.keys(skippers), user) ) {
				// the user hasn't voted to skip this track
				doScrobble(user, data.sk, track);
			}
		});
	}
}

function getStation() {
	var stationUsers = '';

	for ( username in users ) {
		if ( stationUsers.length > 0 )
			stationUsers += ',' + username;
		else
			stationUsers += username;
	}

	return 'lastfm://users/' + stationUsers + '/personal';
}

function onComplete(err) {
	if ( err ) {
		console.log('There was a rebus updating error:', err);
	}
}

function playTrack() {
	var track = tracks.shift();
	console.log("PLAYING TRACK:", track.title, '-', track.creator);

	// add a timestamp to the track as we start it
	track.timestamp = new Date().getTime();

	updateNowPlaying(track);

	bus.publish('currentTrack', track, onComplete );
	bus.publish('skippers', [], onComplete );

	getmp3(track.location);
}

function onEndTrack() {
	scrobble(bus.value.currentTrack);

	// check if there are more songs to play

	if ( tracks.length == 0 ) {
		// there are no more tracks in the current playlist

		if ( getStation() != currentStation ) {
			radioTune();
		}
		else {
			// just get another playlist
			getPlaylist();
		}
	}
	else {
		playTrack();
	}
}

function onRadioGotPlaylist(data) {
	tracks = data.playlist.trackList.track;

	// get all the contexts and insert them into the tracks

	_.each(tracks, function(track) {

		_.each(users, function(data,user) {
			var request = lastfm.request("track.getInfo", {
				track: track.title,
				artist: track.creator,
				username: user,
				handlers: {
					success: function(lfm) {
						console.log(track.title, user, lfm.track.userplaycount)
						track.context = track.context || [];
						if ( lfm.track.userplaycount ) {
							track.context.push({"username":user,"userplaycount":lfm.track.userplaycount,"userloved":lfm.track.userloved});

							if ( bus.value.currentTrack.timestamp == track.timestamp ) {
								// update the current track with the new context
								bus.publish('currentTrack', track, onComplete );
							}
						}
					},
					error: function(error) {
						console.log("Error: " + error.message);
					}
				}
			});
		});
	});

	playTrack();
};

function getPlaylist() {
	var request = lastfm.request("radio.getplaylist", {
		sk: config.sk,
		handlers: {
			success: onRadioGotPlaylist,
			error: function(error) {
				console.log("Error: " + error.message);
			}
		}
	});
}

function onRadioTuned(data) {
	getPlaylist();
};

function radioTune() {
	if ( !_.isEmpty(users) ) {
		currentStation = getStation();

		console.log( currentStation );

		var request = lastfm.request("radio.tune", {
			station: currentStation,
			sk: config.sk,
			handlers: {
				success: onRadioTuned,
				error: function(error) {
					console.log("Error: " + error.message);
				}
			}
		});
	}
}

function onUsersChanged(newUsers) {
	if ( _.intersection(users, newUsers).length == _.keys(users).length ) {
		// the users have changed so we'll need to retune
		// clearing the tracks will make this happen
		tracks = [];
	 }

  	var start = (_.isEmpty(users) && !_.isEmpty(newUsers));
	users = newUsers;

  	if ( start ) {
  		// we've gone from no users to some users so start
  		radioTune(); 
  	}

}

function onSkippersChanged(newSkippers) {
	skippers = newSkippers;
	if ( _.keys(users).length > 0 && _.keys(skippers).length >= Math.ceil(_.keys(users).length / 2) ) {
		console.log( "SKIP!" );
		player.pause();
		sendChatMessage("SKIP!");
	}
}


var bus = rebus('../rebus-storage', function(err) {
	var usersNotification = bus.subscribe('users', onUsersChanged);
	var skippersNotification = bus.subscribe('skippers', onSkippersChanged);

	users = bus.value.users;
	radioTune();
});

function checkPlayingState() {
	if (player.is_playing) {
		setTimeout(checkPlayingState, 500);
	} else {
		onEndTrack();
	}
}

function getmp3(mp3) {
	var media = vlc.mediaFromUrl(mp3);
	media.parseSync();
	player = vlc.mediaplayer;
	player.media = media;
	console.log('Media duration:', media.duration);
	player.play();

	setTimeout(checkPlayingState, 10000);
}

function updateProgress() {
	if (player) {
		doSend('/progress', '{"progress":' + player.position + '}');
	}
}

function sendChatMessage(message) {
	doSend('/chat', '{"message":"' + message + '"}');
}

function doSend(path, data) {
	var options = {
		hostname: 'localhost',
		port: 3001,
		path: path,
		method: 'POST',
		headers: {"content-type":"application/json"}
	};

	var req = http.request(options, function(res) {
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			console.log( path + ' BODY: ' + chunk);
		});
	});

	req.on('error', function(e) {
	  console.log('problem with ' + path + ' request: ' + e.message);
	});

	// write data to request body
	req.write(data);
	req.end();
}

setInterval(updateProgress, 500)



