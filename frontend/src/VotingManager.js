/**
 * This module doesn't really need rebus, it just makes it easier to debug.
 * Feel free to ditch it
 */
module.exports = function(chat, socket, rebus) {
	var that = this;

	var defaultPeriod = 30000;

	var uuid = require('node-uuid');
	var _ = require('underscore');

	var callbacks = {};

	rebus.publish('votings', {});

	// callback(successful, messageFunction)
	that.propose = function(type, user, data, callback) {
		var id = uuid.v4();
		chat.startVoting(user, type, data, id);
		votes = {};
		votes[user.username] = 'yes';
		var votingPeriod = defaultPeriod;
		setVoting({
			id: id,
			type: type,
			user: user.username, 
			data: data,
			votes: votes,
			remainingTime: votingPeriod,
			decision: null
		});

		callbacks[id] = callback;

		var notification = rebus.subscribe('votings.'+id, function(voting) {
	 		socket.broadcast('updateVotes', voting);
	  	});
	};

	socket.on('requestVotes', function(user, data, reply) {
		var voting = getVoting(data.id);
		if (voting) {
			reply('updateVotes', voting);
		}
	});

	socket.on('castVote', function(user, data) {
		var voting = getVoting(data.id);
		if (voting && voting.decision == null) {
			voting.votes[user.username] = (data.vote == 'yes')?'yes':'no';
			setVoting(voting);
		}
	});

	that.voteFor = function(id) {

	};

	that.cancel = function(id) {

	}

	function setVoting(voting) {
		var votings = getVotings();
		votings[voting.id] = voting;
		setVotings(votings);
	}

	function getVoting(id) {
		return getVotings()[id] || null;
	}

	function getVotings() {
		return rebus.value.votings || {}
	}

	function setVotings(votings) {
		rebus.publish('votings', votings);
	}

	setInterval(function() {
		var votings = getVotings();
		_.each(votings, function(voting) {
			if (voting.remainingTime > 0) {
				voting.remainingTime -= 1000;
				if (voting.remainingTime <= 0) {
					// A voting is over
					voting.remainingTime = 0;
					var sumOfVotes = _.countBy(_.values(voting.votes), function(value) { return value; });
					var yesVotes = sumOfVotes['yes'] || 0;
					var noVotes = sumOfVotes['no'] || 0;
					voting.decision = (yesVotes > noVotes) ? 'yes' : 'no';
					callbacks[voting.id](voting.decision == 'yes');
					delete callbacks[voting.id];
				}
				setVoting(voting);
			}
		})
	}, 1000);
	
}