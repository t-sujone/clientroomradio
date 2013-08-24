function MainController($scope, socket) {
	$scope.username = loggedInAs;
	$scope.radioname = config.name;
	$scope.currentTrack = {};
	$scope.users = [];
	$scope.skippers = [];
	$scope.currentPositionInTrack = 0;
	$scope.loved = false;
	$scope.skipped = false;
	$scope.scrobbling = true;

	$scope.login = function() {
		location.href = "http://www.last.fm/api/auth/?api_key="+config.api_key+"&cb="+$(location).attr('href')+"login";
	}

	$scope.love = function() {
		$scope.loved = true;
		socket.love();
	}

	$scope.unlove = function() {
		$scope.loved = false;
		socket.unlove();
	}

	$scope.skip = function(message) {
		socket.sendSkip(message);
	}

	$scope.setScrobbling = function(value) {
		$scope.scrobbling = value;
	}

	// Some helper functions
	$scope.skippersNeeded = function() {
		return Math.ceil($scope.getUserCount() / 2);
	} 

	$scope.getUserCount = function() {
		return _.keys($scope.users).length;
	}

	// Update progress bar

	$scope.progressBarStyle = function() {
		return {'width':  ($scope.currentPositionInTrack / $scope.currentTrack.duration * 100) + '%'};
	};

	$scope.durationInText = function() {
		var inSec = $scope.currentTrack.duration / 1000;

		return Math.floor(inSec / 60) + ':' + (inSec % 60);
	}

	socket.newTrackCallback.add(function(data) {
		$scope.currentTrack = data;

		$scope.loved = false;
		if (data.context) {
			for(var i=0, len=data.context.length; i < len; i++){
				if(data.context[i].userloved == 1 && loggedInAs == data.context[i].username) {
					$scope.loved = true;
				}
			}
		}

		$scope.$apply();
	});
			
	socket.progressCallback.add(function(progress) {
		$scope.currentPositionInTrack = $scope.currentTrack.duration * progress;
		$scope.$apply();
	});

	socket.usersCallback.add(function(data) {
		$scope.users = data;
		$scope.$apply();
	});

	socket.skippersCallback.add(function(data) {
		$scope.skippers = data;
		$scope.skipped = false;
		for(var i=0, len=data.length; i < len; i++){
			var user = data[i];
			if (user == loggedInAs) {
				$scope.skipped = true;
			}
		}
		$scope.$apply();
	});

	socket.sysCallback.add(function(data) {
		if (data.type == 'skip') {
			$scope.skipped = true;
			$scope.$apply();
		}
	});
}