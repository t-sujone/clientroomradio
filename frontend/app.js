// Classes
var Chat = require('./src/Chat.js');
var CurrentTrackChatUpdater = require('./src/CurrentTrackChatUpdater.js');
var CurrentTrackDao = require('./src/CurrentTrackDao.js');
var EndOfDayRequestManager = require('./src/EndOfDayRequestManager.js');
var DiscoveryHourRequestManager = require('./src/DiscoveryHourRequestManager.js');
var ExpressExternal = require('./src/ExpressExternal.js');
var ExpressInternal = require('./src/ExpressInternal.js');
var ExternalHttpServer = require('./src/ExternalHttpServer.js');
var FrontendUpdater = require('./src/FrontendUpdater.js');
var HeartbeatManager = require('./src/HeartbeatManager.js');
var LastfmClient = require('./src/LastfmClient.js');
var LoveManager = require('./src/LoveManager.js');
var ProgressManager = require('./src/ProgressManager.js');
var PermissionChecker = require('./src/PermissionChecker.js');
var ScrobblingManager = require('./src/ScrobblingManager.js');
var SkipManager = require('./src/SkipManager.js');
var SkippersDao = require('./src/SkippersDao.js');
var Socket = require('./src/Socket.js');
var SpotifyRequestIssuer = require('./src/SpotifyRequestIssuer.js');
var UserActivityFlagManager = require('./src/UserActivityFlagManager.js');
var UserDao = require('./src/UserDao.js');
var VotingManager = require('./src/VotingManager.js');

// Instances
var rebus = require('./src/rebus.js');
var config = require('../config.js');

rebus.onReady = function() {
	// DI
	var lastfmClient = new LastfmClient(config);
	var permissionChecker = new PermissionChecker(config, lastfmClient)
	var userDao = new UserDao(rebus, lastfmClient);
	var skippersDao  = new SkippersDao(rebus);
	var currentTrackDao = new CurrentTrackDao(rebus);
	var socket = new Socket(userDao);
	var chat = new Chat(socket, config);
	var progressManager = new ProgressManager(socket);
	var expressInternal = new ExpressInternal(config, chat, progressManager);
	var expressExternal = new ExpressExternal(config, lastfmClient, userDao, chat, permissionChecker);
	var externalHttpServer = new ExternalHttpServer(expressExternal, socket, config);
	var votingManager = new VotingManager(chat, socket, rebus);

	// Nothing depends on those:
	new FrontendUpdater(socket, userDao, currentTrackDao, skippersDao);
	new SkipManager(socket, skippersDao, chat);
	new ScrobblingManager(socket, userDao, chat);
	new LoveManager(socket, currentTrackDao, chat, lastfmClient);
	var heartbeatManager = new HeartbeatManager(socket, chat, userDao);
	new CurrentTrackChatUpdater(currentTrackDao, chat);
	new SpotifyRequestIssuer(chat, socket, config);
	new EndOfDayRequestManager(userDao, votingManager, socket);
	new DiscoveryHourRequestManager(userDao, votingManager, socket, config);
	new UserActivityFlagManager(userDao, chat, socket)

	// Start
	expressInternal.start();
	expressExternal.start();
	externalHttpServer.start();
	heartbeatManager.start();
}