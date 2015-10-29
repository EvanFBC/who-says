var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mustache = require('mustache-express');
var Moniker = require('moniker');
var bodyParser = require('body-parser');

// Run this thing on heroku
app.set('port', (process.env.PORT || 3000));

// mustache template engine
app.engine('mustache', mustache());
app.set('view engine', 'mustache');
app.set('views', __dirname + '/views');

app.use("/public", express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));

var password = 'secretpassword';

var roompool = {
  rooms: {},

  add: function(id) {
    if (!this.get(id))
      this.rooms[id] = {players: [], id: id};
  },

  get: function(id) {
    return this.rooms[id];
  },

  remove: function(id) {
    if (this.get(id))
      delete this.rooms[id];
  },

  addPlayer: function(id, sock) {
    var r = this.get(id);
    if (r)
      if (r.players.indexOf(sock) == -1)
        r.players.push(sock);
  },

  removePlayer: function(id, sock) {
    var r = this.get(id);
    if (r) {
      var index = r.players.indexOf(sock);
      if (index != -1)
        r.players.splice(index, 1);
    }
  },

  emit: function(id) {
    var args = new Array(arguments.length - 1);
    for (i = 1; i < arguments.length; i++)
      args[i-1] = arguments[i];

    var r = this.get(id);
    if (r)
      for (var i = 0; i < r.players.length; i++)
        r.players[i].emit.apply(r.players[i], args);
  },

  emitPlayerCount: function(id) {
    var r = this.get(id);
    if (r)
      this.emit(id, 'count', r.players.length);
  },
};

// add room
app.get('/openroom/' + password + '/:room', function(req, res) {
  roompool.add(req.params.room);
  res.redirect('/' + req.params.room);
});

// remove room
app.get('/closeroom/' + password + '/:room', function(req, res) {
  roompool.remove(req.params.room);
  res.set('Content-Type', 'text/plain');
  res.send('ok')
});

app.get('/randomname', function(req, res){
  var name = Moniker.choose();

  res.set('Content-Type', 'text/plain');
  res.send(name);
});

app.post('/host', function(req, res){
  // TODO: better logic around hosting an existing room name
  roompool.add(req.body.room);
  res.redirect('/' + req.body.room + '/dealer');
});

var renderGame = function(req, res, view) {
  var r = roompool.get(req.params.room);
  if (r)
    res.render(view, {id: r.id});
  else
    res.status(404).send('not found');
};

// dealer
app.get('/:room/dealer', function(req, res) {
  renderGame(req, res, 'dealer');
});

// player
app.get('/:room', function(req, res) {
  renderGame(req, res, 'player');
});

app.get('/', function(req, res) {
    res.render('index');
});

io.on('connection', function(sock) {
  sock.on('join', function(d) {
    var r = roompool.get(d.room);
    if (r) {
      sock.r = r;
      roompool.addPlayer(r.id, sock);
      roompool.emitPlayerCount(r.id);
    }
  });

  sock.on('disconnect', function() {
    if (sock.r) {
      roompool.removePlayer(sock.r.id, sock);
      roompool.emitPlayerCount(sock.r.id);
    }
  });

  var echo = function(evt) {
    return function(d) {
      if (sock.r)
        roompool.emit(sock.r.id, evt, d);
    };
  };

  sock.on('answer', echo('answer'));
  sock.on('deal', echo('deal'));
});

// shhhh, just listen
http.listen(app.get('port'), function() {
  console.log('starting app');
});
