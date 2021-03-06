if (process.argv [2]) return console.log ('Tests cannot only be run locally.');

var CONFIG = require ('./config.js');
var dale   = require ('dale');
var teishi = require ('teishi');
var h      = require ('hitit');
var clog   = teishi.clog, type = teishi.type, eq = teishi.eq;

var U = [
   {username: '   user  \t1', password: Math.random () + '@', tz: new Date ().getTimezoneOffset ()},
   {username: 'user2',        password: Math.random () + '@', tz: new Date ().getTimezoneOffset ()},
];

var PICS = 'test/';

var getUTCTime = function (dstring) {
   return new Date (dstring.replace (/\//g, '-') + 'T00:00:00.000Z').getTime ();
}

var H = {};

H.trim = function (s) {
   return s.replace (/^\s+|\s+$/g, '').replace (/\s+/g, ' ');
}

var ttester = function (label, method, Path, headers, list, allErrors) {
   var apres = allErrors ? function (s, rq, rs) {
      return rs.code >= 400;
   } : undefined;

   var types = {
      string:    function () {return Math.random () + ''},
      integer:   function () {return Math.round (Math.random () + Math.random ())},
      float:     function () {return Math.random ()},
      nan:       function () {return NaN},
      infinity:  function () {return Infinity},
      object:    function () {return {}},
      array:     function () {return []},
      null:      function () {return null},
      boolean:   function () {return Math.random > 0.5},
      undefined: function () {},
   }

   var tests = {}, longest = 0;

   dale.go (list, function (v) {
      var path = v [0], allowed = v [1];
      if (type (path) !== 'array') path = [path];
      if (path.length > longest) longest = path.length;
      dale.go (dale.times (path.length), function (k) {
         if (k < path.length) {
            return tests [JSON.stringify (path.slice (0, k))] = [type (path [k]) === 'integer' ? 'array' : 'object'];
         }
         tests [JSON.stringify (path)] = type (allowed) === 'array' ? allowed : [allowed];
      });
   });

   var output = [];
   var body = type (JSON.parse (dale.keys (tests) [0]) [0]) === 'string' ? {} : [];

   dale.go (dale.times (longest), function (length) {
      dale.go (tests, function (allowed, path) {
         path = JSON.parse (path);
         if (path.length !== length) return;
         if (output.length === 0) {
            // base object test
            dale.go (types, function (tfun, t) {
               if (t !== type (body)) output.push ([label + ' test type #' + (output.length + 1) + ' base - ' + t, method, Path, headers, tfun (), allErrors ? '*' : 400, apres]);
            });
         }
         var ref = body;
         dale.go (dale.times (path.length - 1, 0), function (k) {
            if (! ref [path [k]]) ref [path [k]] = type (path [k + 1]) === 'integer' ? [] : {};
            ref = ref [path [k]];
         });
         dale.go (types, function (tfun, t) {
            ref [path [path.length - 1]] = tfun ();
            if (allowed.indexOf (t) === -1) output.push ([label + ' test type #' + (output.length + 1) + ' ' + path.join ('.') + ' - ' + t, method, Path, headers, teishi.copy (body), allErrors ? '*' : 400, apres]);
         });
         ref [path [path.length - 1]] = types [allowed [0]] ();
      });
   });
   var ebody = teishi.copy (body);
   ebody [type (ebody) === 'object' ? types.string () : types.float ()] = types.string ();
   output.push ([label + ' test type #' + (output.length + 1) + ' base (random key)', method, Path, headers, ebody, allErrors ? '*' : 400, apres]);

   return output;
}

var intro = [
   ['submit client error, invalid 1', 'post', 'error', {}, '', 400],
   ['submit client error without being logged in #2', 'post', 'error', {}, {error: 'error'}, 200],
   ['login with no credentials', 'post', 'auth/login', {}, {}, 400],
   ['login with invalid credentials', 'post', 'auth/login', {}, [], 400],
   ttester ('login', 'post', 'auth/signup', {}, [
      ['username', 'string'],
      ['password', 'string'],
      ['email', 'string'],
      ['token', 'string'],
   ]),
   ttester ('login', 'post', 'auth/login', {}, [
      ['username', 'string'],
      ['password', 'string'],
      ['tz',       'integer'],
   ]),
   ttester ('reset', 'post', 'auth/reset', {}, [
      ['username', 'string'],
      ['password', 'string'],
      ['token',    'string'],
   ]),
   ttester ('create invite for user', 'post', 'admin/invites', {}, [
      ['email', 'string'],
      ['firstName', 'string'],
   ]),
   ['create invite for user, invalid email', 'post', 'admin/invites', {}, {email: 'che'}, 400],
   ['create invite for user, no firstName', 'post', 'admin/invites', {}, {email: 'a@a.com'}, 400],
   ['create invite for user', 'post', 'admin/invites', {}, {firstName: 'a', email: 'a@a.com  '}, 200, function (s, rq, rs) {
      s.itoken1 = rs.body.token;
      return true;
   }],
   ['create invite for user', 'post', 'admin/invites', {}, {firstName: 'b', email: 'b@b.com  '}, 200, function (s, rq, rs) {
      s.itoken2 = rs.body.token;
      return true;
   }],
   ['signup for the first time with invalid username', 'post', 'auth/signup', {}, function (s) {
      return {username: 'a@a.com', password: U [0].password, token: s.itoken1, email: 'a@a.com'};
   }, 400],
   ['signup for the first time with invalid email', 'post', 'auth/signup', {}, function (s) {
      return {username: U [0].username, password: U [0].password, token: s.itoken1, email: 'aa.com'};
   }, 400],
   ['signup for the first time with invalid token', 'post', 'auth/signup', {}, function (s) {
      return {username: U [0].username, password: U [0].password, token: s.itoken1 + 'a', email: 'a@a.com'};
   }, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'token'})) return clog ('Invalid body.');
      return true;
   }],
   ['signup for the first time', 'post', 'auth/signup', {}, function (s) {
      return {username: U [0].username, password: U [0].password, token: s.itoken1, email: 'a@a.com'};
   }, 200, function (s, rq, rs) {
      if (! rs.body.token) return clog ('No token returned after signup!');
      s.vtoken1 = rs.body.token;
      return true;
   }],
   ['login with invalid credentials #1', 'post', 'auth/login', {}, {username: U [0].username, password: 'foo', tz: new Date ().getTimezoneOffset ()}, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'auth'})) return clog ('Invalid payload sent, expecting {error: "auth"}');
      return true;
   }],
   ['login with invalid credentials #2', 'post', 'auth/login', {}, {username: 'bar', password: 'foo', tz: new Date ().getTimezoneOffset ()}, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'auth'})) return clog ('Invalid payload sent, expecting {error: "auth"}');
      return true;
   }],
   ['login with valid credentials before verification', 'post', 'auth/login', {}, {username: U [0].username, password: U [0].password, tz: new Date ().getTimezoneOffset ()}, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'verify'})) return clog ('Invalid payload sent, expecting {error: "verify"}');
      return true;
   }],
   ['try to signup with existing username', 'post', 'auth/signup', {}, function (s) {
      return {username: U [0].username, password: U [1].password, token: s.itoken2, email: 'b@b.com'};
   }, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'username'})) return clog ('Invalid payload received.');
      return true;
   }],
   ['try to signup with existing email', 'post', 'auth/signup', {}, function (s) {
      return {username: U [1].username, password: U [1].password, token: s.itoken2, email: 'a@a.com'};
   }, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'token'})) return clog ('Invalid payload received.');
      return true;
   }],
   ['verify user', 'get', function (s) {return 'auth/verify/' + s.vtoken1}, {}, '', 302],
   ttester ('recover pass', 'post', function (s) {return 'auth/verify/' + s.vtoken1}, {}, [
      ['username', 'string'],
   ], true),
   ['recover pass with invalid username', 'post', 'auth/recover', {}, {username: 'foo'}, 403],
   ['recover pass', 'post', 'auth/recover', {}, {username: 'a@a.com\t'}, 200],
   ['recover pass', 'post', 'auth/recover', {}, {username: 'user\t  1  '}, 200, function (s, rq, rs) {
      s.rtoken = rs.body.token;
      U [0].password = 'foobar';
      return true;
   }],
   ['reset pass with invalid token', 'post', 'auth/reset', {}, function (s) {return {username: H.trim (U [0].username), password: U [0].password, token: s.rtoken + '0'}}, 403],
   ['reset pass with invalid password', 'post', 'auth/reset', {}, function (s) {return {username: H.trim (U [0].username), password: 'abc', token: s.rtoken}}, 400],
   ['reset pass', 'post', 'auth/reset', {}, function (s) {return {username: H.trim (U [0].username), password: U [0].password, token: s.rtoken}}, 200],
   ['try to signup with existing username after verification', 'post', 'auth/signup', {}, function (s) {
      return {username: U [0].username, password: U [1].password, token: s.itoken2, email: 'b@b.com'};
   }, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'username'})) return clog ('Invalid payload received.');
      return true;
   }],
   ['try to signup with existing email after verification', 'post', 'auth/signup', {}, function (s) {
      return {username: U [1].username, password: U [0].password, token: s.itoken2, email: 'a@a.com'};
   }, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'token'})) return clog ('Invalid payload received.');
      return true;
   }],
   ['login with valid credentials after verification (with email)', 'post', 'auth/login', {}, U [0], 200],
   ['login with valid credentials after verification (with email)', 'post', 'auth/login', {}, function () {return {username: ' \t  a@a.com', password: U [0].password, tz: new Date ().getTimezoneOffset ()}}, 200],
   ['login with valid credentials after verification (with email)', 'post', 'auth/login', {}, function () {return {username: 'A@A.com  ', password: U [0].password, tz: new Date ().getTimezoneOffset ()}}, 200],
   ['login with valid credentials after verification (with email)', 'post', 'auth/login', {}, function () {return {username: ' USER 1\t   ', password: U [0].password, tz: new Date ().getTimezoneOffset ()}}, 200, function (s, rq, rs) {
      if (! rs.headers ['set-cookie'] || ! rs.headers ['set-cookie'] [0] || rs.headers ['set-cookie'] [0].length <= 5) return clog ('Invalid cookie.');
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ttester ('change password', 'post', 'auth/changePassword', {}, [
      ['old', 'string'],
      ['new', 'string'],
   ]),
   ['change password (invalid new password #1)', 'post', 'auth/changePassword', {}, {old: U [0].password, 'new': '12345'}, 400],
   ['change password (invalid new password #2)', 'post', 'auth/changePassword', {}, {old: U [0].password, 'new': 12345}, 400],
   ['change password (invalid old password)', 'post', 'auth/changePassword', {}, {old: 'foo', 'new': '123456'}, 403],
   ['change password', 'post', 'auth/changePassword', {}, function (s) {return {old: U [0].password, 'new': '123456'}}, 200],
   ['change password again', 'post', 'auth/changePassword', {}, function (s) {return {old: '123456', 'new': U [0].password}}, 200],
   ['login with valid credentials after second password change', 'post', 'auth/login', {}, function () {return {username: ' USER 1\t   ', password: U [0].password, tz: new Date ().getTimezoneOffset ()}}, 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return true;
   }],
   ['submit client error being logged in', 'post', 'error', {}, {error: 'error'}, 200],
];

var outro = [
   ['logout', 'post', 'auth/logout', {}, {}, 200, function (s, rq, rs) {
      if (! rs.headers ['set-cookie'] || ! rs.headers ['set-cookie'] [0].match (/max-age/i)) return false;
      return true;
   }],
   ['delete account with invalid cookie', 'post', 'auth/delete', {}, {}, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'session'})) return clog ('Invalid payload sent, expecting {error: "session"}');
      s.headers = {};
      return true;
   }],
   {tag: 'double logout', method: 'post', path: 'auth/logout', code: 403, headers: {}, body: {}, apres: function (s, rq, rs) {
      if (! eq (rs.body, {error: 'nocookie'})) return clog ('Invalid payload sent, expecting {error: "nocookie"}');
      return true;
   }},
   ['login with valid credentials', 'post', 'auth/login', {}, U [0], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['delete account with invalid cookie', 'post', 'auth/delete', {cookie: 'foobar'}, {}, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'noappcookie'})) return clog ('Invalid payload sent, expecting {error: "noappcookie"}');
      return true;
   }],
   ['delete account with tampered cookie', 'post', 'auth/delete', {cookie: 'oml-session=foobar'}, {}, 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'noappcookie'})) return clog ('Invalid payload sent, expecting {error: "noappcookie"}');
      return true;
   }],
   ['delete account', 'post', 'auth/delete', {}, {}, 200, function (s, rq, rs) {
      if (! rs.headers ['set-cookie'] || ! rs.headers ['set-cookie'] [0].match (/max-age/i)) return false;
      s.headers = {};
      return true;
   }],
   ['delete account with no cookie', 'post', 'auth/delete', {}, U [0], 403, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'nocookie'})) return clog ('Invalid payload sent, expecting {error: "nocookie"}');
      return true;
   }],
   ['login with deleted credentials', 'post', 'auth/login', {}, U [0], 403],
];

var main = [
   ['check that regular user cannot reach the admin', 'get', 'admin/invites', {}, '', 403],
   ttester ('feedback', 'post', 'feedback', {}, [
      ['message', 'string'],
   ]),
   ['send feedback', 'post', 'feedback', {}, {message: 'La radio está buenísima.'}, 200],
   ['get account at the beginning of the test cycle', 'get', 'account', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return clog ('Body must be object');
      if (! eq ({username: 'user 1', email: 'a@a.com', type: 'tier1'}, {username: rs.body.username, email: rs.body.email, type: rs.body.type})) return clog ('Invalid values in fields.');
      if (type (rs.body.created) !== 'integer') return clog ('Invalid created field');
      if (type (rs.body.used) !== 'array' || rs.body.used.length !== 2 || rs.body.used [0] !== 0) return clog ('Invalid used field.');
      if (type (rs.body.logs) !== 'array' || (rs.body.logs.length !== 9 && rs.body.logs.length !== 10)) return clog ('Invalid logs.');
      return true;
   }],
   ttester ('query pics', 'post', 'query', {}, [
      [['tags', 0], 'string'],
      ['mindate', ['undefined', 'integer']],
      ['maxdate', ['undefined', 'integer']],
      ['sort', 'string'],
      ['from', 'integer'],
      ['to', 'integer'],
   ]),
   {tag: 'query pics without csrf token', method: 'post', path: 'query', code: 403, body: {tags: ['all'], sort: 'newest', from: 1, to: 10}, apres: function (s, rq, rs) {
      if (! eq (rs.body, {error: 'csrf'})) return clog ('Invalid payload');
      return true;
   }},
   ['query pics with invalid tag', 'post', 'query', {}, {tags: ['all'], sort: 'newest', from: 1, to: 10}, 400],
   ['get invalid range of pics', 'post', 'query', {}, {tags: [], sort: 'newest', from: 3, to: 1}, 400],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (! eq (rs.body, {total: 0, pics: []})) return clog ('Invalid payload');
      return true;
   }],
   ['upload invalid payload #1', 'post', 'pic', {}, '', 400],
   ['upload invalid payload #2', 'post', 'pic', {}, 1, 400],
   ['upload invalid payload #3', 'post', 'pic', {}, [], 400],
   ['upload invalid payload #4', 'post', 'pic', {}, {}, 400],
   ['upload invalid payload #5', 'post', 'pic', {}, {file: {}}, 400],
   ['upload video (no support)', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'bach.mp4'},
      {type: 'field',  name: 'lastModified', value: Date.now ()}
   ]}, 400],
   ['upload empty picture', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'empty.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field', name: 'lastModified', value: Date.now ()},
   ]}, 400],
   ['upload invalid picture', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'invalid.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()}
   ]}, 400],
   ['upload picture without uid', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field',  name: 'lastModified', value: Date.now ()}
   ]}, 400],
   ['upload picture without lastModified', 'post', 'pic', {}, {multipart: [
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'file',  name: 'pic', path: PICS + 'small.png'}
   ]}, 400],
   ['upload small picture with extra text field', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'extra', value: Date.now ()}
   ]}, 400],
   ['upload small picture with extra file field', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'file',  name: 'pic2', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()}
   ]}, 400],
   ['upload small picture with invalid tags #1', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: 'foobar'},
   ]}, 400],
   ['upload small picture with invalid tags #2', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: JSON.stringify ([2])},
   ]}, 400],
   ['upload small picture with invalid tags #3', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: JSON.stringify (['hello', 'all'])},
   ]}, 400],
   ['upload small picture with invalid tags #4', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: JSON.stringify (['hello', '2017'])},
   ]}, 400],
   ['upload small picture', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: new Date ('2018-06-07T00:00:00.000Z').getTime ()}
   ]}, 200],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return clog ('Invalid payload.');
      if (rs.body.total !== 1) return clog ('Invalid total count.');
      if (type (rs.body.pics) !== 'array') return clog ('Invalid pic array.');
      var pic = rs.body.pics [0];
      s.smallpic = teishi.copy (pic);
      if (pic.date !== getUTCTime ('2018/06/07')) return clog ('Invalid pic.date');
      if (type (pic.date)   !== 'integer') return clog ('Invalid pic.date.');
      if (type (pic.dateup) !== 'integer') return clog ('Invalid pic.dateup.');
      delete pic.date;
      delete pic.dateup;
      if (type (pic.id) !== 'string') return clog ('Invalid pic.id.');
      delete pic.id;
      if (! eq (pic, {
         owner: U [0].username.replace (/^\s+/, '').replace (' \t', ''),
         name: 'small.png',
         dimh: 149,
         dimw: 149,
         tags: ['2018']
      })) return clog ('Invalid pic fields.');
      return true;
   }],
   ['upload duplicated picture', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'smalldup.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()}
   ]}, 409],
   ['delete freshly uploaded picture', 'delete', function (s) {
      return 'pic/' + s.smallpic.id;
   }, {}, '', 200],
   ['upload small picture again', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'small.png'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: new Date ('2018-06-07T00:00:00.000Z').getTime ()}
   ]}, 200],
   ['upload medium picture', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'medium.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: new Date ('2018-06-03T00:00:00.000Z').getTime ()}
   ]}, 200],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return clog ('Invalid payload.');
      if (rs.body.total !== 2) return clog ('Invalid total count.');
      if (type (rs.body.pics) !== 'array') return clog ('Invalid pic array.');
      var pic = rs.body.pics [0];
      if (pic.date !== getUTCTime ('2018/06/03')) return clog ('Invalid pic.date');
      if (type (pic.dateup) !== 'integer') return clog ('Invalid pic.dateup.');
      delete pic.date;
      delete pic.dateup;
      if (type (pic.id) !== 'string') return clog ('Invalid pic.id.');
      delete pic.id;
      if (type (pic.t200) !== 'string') return clog ('Invalid pic.t200.');
      delete pic.t200;
      if (! eq (pic, {
         owner: U [0].username.replace (/^\s+/, '').replace (' \t', ''),
         name: 'medium.jpg',
         dimh: 204,
         dimw: 248,
         tags: ['2018']
      })) return clog ('Invalid pic fields.');
      return true;
   }],
   ['upload large picture', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'large.jpeg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()}
   ]}, 200],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 1}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return clog ('Invalid payload.');
      if (rs.body.total !== 3) return clog ('Invalid total count.');
      if (type (rs.body.pics) !== 'array') return clog ('Invalid pic array.');
      if (rs.body.pics.length !== 1) return clog ('Invalid amount of pictures returned.');
      var pic = rs.body.pics [0];
      if (pic.date !== 1405880431000) return clog ('Invalid pic.date');
      delete pic.date;
      delete pic.dateup;
      delete pic.id;
      if (type (pic.t200) !== 'string') return clog ('Invalid pic.t200.');
      if (type (pic.t900) !== 'string') return clog ('Invalid pic.t900.');
      delete pic.t200;
      delete pic.t900;
      return true;
      if (! eq (pic, {
         owner: U [0].username.replace (/^\s+/, '').replace (' \t', ''),
         name: 'large.jpeg',
         dimh: 204,
         dimw: 248,
         tags: ['2014']
      })) return clog ('Invalid pic fields.');
      return true;
   }],
   ['upload lopsided picture', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'rotate.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()}
   ]}, 200],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 1}, 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return clog ('Invalid payload.');
      if (rs.body.total !== 4) return clog ('Invalid total count.');
      if (type (rs.body.pics) !== 'array') return clog ('Invalid pic array.');
      var pic = rs.body.pics [0];
      if (type (pic.date)   !== 'integer') return clog ('Invalid pic.date.');
      if (type (pic.dateup) !== 'integer') return clog ('Invalid pic.dateup.');
      if (pic.date !== 1490204120000) return clog ('Invalid date.');
      s.rotateid = pic.id;
      s.rotatepic = teishi.copy (pic);
      delete pic.date;
      delete pic.dateup;
      if (type (pic.id) !== 'string') return clog ('Invalid pic.id.');
      delete pic.id;
      if (type (pic.t200) !== 'string') return clog ('Invalid pic.t200.');
      delete pic.t200;
      if (type (pic.t900) !== 'string') return clog ('Invalid pic.t900.');
      delete pic.t900;
      if (! eq (pic, {
         owner: U [0].username.replace (/^\s+/, '').replace (' \t', ''),
         name: 'rotate.jpg',
         dimh: 1232,
         dimw: 2048,
         tags: ['2017']
      })) return clog ('Invalid pic fields.');
      return true;
   }],
   ttester ('rotate pic', 'post', 'rotate', {}, [
      ['ids', 'array'],
      ['deg', 'integer'],
   ]),
   ['rotate pic (invalid #1)', 'post', 'rotate', {}, {ids: ['hello'], deg: 45}, 400],
   ['rotate pic (invalid #2, repeated)', 'post', 'rotate', {}, {ids: ['hello', 'hello'], deg: -90}, 400],
   ['rotate pic (invalid #3, type)', 'post', 'rotate', {}, {ids: 'hello', deg: -90}, 400],
   ['rotate pic nonexisting #1', 'post', 'rotate', {}, {ids: ['hello'], deg: -90}, 404],
   ['rotate pic nonexisting #2', 'post', 'rotate', {}, function (s) {
      return {ids: [s.rotateid, 'foo'], deg: 90};
   }, 404],
   ['rotate pic', 'post', 'rotate', {}, function (s) {
      return {ids: [s.rotateid], deg: 90};
   }, 200],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 1}, 200, function (s, rq, rs) {
      var pic = rs.body.pics [0];
      delete pic.id;
      if (type (pic.t200) !== 'string') return clog ('Invalid pic.t200.');
      delete pic.t200;
      if (type (pic.t900) !== 'string') return clog ('Invalid pic.t900.');
      delete pic.t900;
      if (s.rotatepic.date !== pic.date)     return clog ('date changed after rotate.');
      if (s.rotatepic.dateup !== pic.dateup) return clog ('dateup changed after rotate.');
      delete pic.date;
      delete pic.dateup;
      if (! eq (pic, {
         owner: U [0].username.replace (/^\s+/, '').replace (' \t', ''),
         name: 'rotate.jpg',
         dimh: 1232,
         dimw: 2048,
         deg:  90,
         tags: ['2017']
      })) return clog ('Invalid pic fields.');
      return true;
   }],
   dale.go ([[-90, undefined], [180, 180], [180, undefined], [-90, -90], [-90, 180], [-90, 90], [180, -90], [90, undefined]], function (pair, k) {
      return [
         ['rotate pic #' + (k + 2), 'post', 'rotate', {}, function (s) {
            return {ids: [s.rotateid], deg: pair [0]};
         }, 200],
         ['get pics', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 1}, 200, function (s, rq, rs) {
            var pic = rs.body.pics [0];
            if (pic.deg !== pair [1]) return clog ('Rotate wasn\'t calculated properly.');
            return true;
         }],
      ];
   }),
   ['upload picture with different date format', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'dunkerque.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: JSON.stringify (['dunkerque\t', '   beach'])},
   ]}, 200],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      var pic = rs.body.pics [0];
      if (pic.date !== 1522070614000) return clog ('GPS timestamp wasn\'t ignored.');
      if (! eq (pic.tags.sort (), ['2018', 'beach', 'dunkerque'])) return clog ('Wrong year tag.');
      s.dunkerque = pic.id;
      s.allpics = rs.body.pics;
      return true;
   }],
   dale.go (dale.times (5, 0), function (k) {
      return {tag: 'get original pic', method: 'get', path: function (s) {return 'original/' + s.allpics [k].id}, code: 200, raw: true, apres: function (s, rq, rs) {
         var up       = Buffer.from (rs.body, 'binary');
         var original = require ('fs').readFileSync ([PICS + 'dunkerque.jpg', PICS + 'rotate.jpg', PICS + 'large.jpeg', PICS + 'medium.jpg', PICS + 'small.png'] [k]);
         if (Buffer.compare (up, original) !== 0) return clog ('Mismatch between original and uploaded picture!');
         return true;
      }};
   }),
   ['delete picture with different date format', 'delete', function (s) {
      return 'pic/' + s.dunkerque;
   }, {}, '', 200],
   ['get pics by newest', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (['small.png', 'medium.jpg', 'rotate.jpg', 'large.jpeg'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by oldest', 'post', 'query', {}, {tags: [], sort: 'oldest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (['large.jpeg', 'rotate.jpg', 'medium.jpg', 'small.png'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by mindate #1', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4, mindate: 1490204120000}, 200, function (s, rq, rs) {
      if (! eq (['small.png', 'medium.jpg', 'rotate.jpg'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by mindate #2', 'post', 'query', {}, {tags: [], sort: 'oldest', from: 1, to: 4, mindate: 1490204120000}, 200, function (s, rq, rs) {
      if (! eq (['rotate.jpg', 'medium.jpg', 'small.png'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by maxdate #1', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4, maxdate: 1490204120000}, 200, function (s, rq, rs) {
      if (! eq (['rotate.jpg', 'large.jpeg'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by maxdate #2', 'post', 'query', {}, {tags: [], sort: 'oldest', from: 1, to: 4, maxdate: 1490204120000}, 200, function (s, rq, rs) {
      if (! eq (['large.jpeg', 'rotate.jpg'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by year #1', 'post', 'query', {}, {tags: ['2018'], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (['small.png', 'medium.jpg'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by year #2', 'post', 'query', {}, {tags: ['2018'], sort: 'oldest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (['medium.jpg', 'small.png'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by year #3', 'post', 'query', {}, {tags: ['2017', '2018'], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (['small.png', 'medium.jpg', 'rotate.jpg'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get pics by year #4', 'post', 'query', {}, {tags: ['2017', '2014', '2015'], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (['rotate.jpg', 'large.jpeg'], dale.go (rs.body.pics, function (v) {
         return v.name;
      }))) return clog ('Invalid pic date sorting');
      return true;
   }],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 4})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ttester ('tag pic', 'post', 'tag', {}, [
      ['tag', 'string'],
      [['ids', 0], 'string'],
      ['del', ['boolean', 'undefined']],
   ]),
   ['tag invalid #1', 'post', 'tag', {}, {tag: 'all', ids: ['a']}, 400],
   ['tag invalid #2', 'post', 'tag', {}, {tag: '\nall', ids: ['a']}, 400],
   ['tag invalid #3', 'post', 'tag', {}, {tag: '2018', ids: ['a']}, 400],
   ['tag invalid #4', 'post', 'tag', {}, {tag: 'untagged', ids: ['a']}, 400],
   ['tag invalid #5', 'post', 'tag', {}, {tag: 'hello', ids: ['a', 'a']}, 400],
   ['tag invalid nonexisting #1', 'post', 'tag', {}, {tag: 'hello', ids: ['a']}, 404],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 4})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 4})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      s.pics = rs.body.pics;
      return true;
   }],
   dale.go (dale.times (4, 0), function (k) {
      return [
         ['get pic #' + (k + 1), 'get', function (s) {
            return 'pic/' + s.pics [k].id;
         }, {}, '', 200],
         k === 0 ? [] : ['get thumb 200 #' + (k + 1), 'get', function (s) {
            return 'thumb/' + s.pics [k].t200;
         }, {}, '', 200],
         k === 0 ? [] : ['get thumb 900 #' + (k + 1), 'get', function (s) {
            return 'thumb/' + s.pics [k].t200;
         }, {}, '', 200],
      ];
   }),
   ['tag nonexisting #2', 'post', 'tag', {}, function (s) {
      return {tag: '\tfoo', ids: [s.pics [0].id, 'b']};
   }, 404],
   ['tag valid #1', 'post', 'tag', {}, function (s) {
      return {tag: '\tfoo', ids: [s.pics [0].id]};
   }, 200],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 3, foo: 1})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['get tagged pic', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (rs.body.pics [0].tags, ['2018', 'foo'])) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['tag valid #2', 'post', 'tag', {}, function (s) {
      return {tag: 'foo', ids: [s.pics [0].id]};
   }, 200],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 3, foo: 1})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['get tagged pic', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (rs.body.pics [0].tags, ['2018', 'foo'])) return clog ('Invalid tags');
      return true;
   }],
   ['get tagged pic', 'post', 'query', {}, {tags: ['foo'], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (rs.body.total !== 1) return clog ('Searching by tag does not work.');
      if (! eq (rs.body.pics [0].tags, ['2018', 'foo'])) return clog ('Invalid tags');
      return true;
   }],
   ['untag nonexisting', 'post', 'tag', {}, function (s) {
      return {tag: '\tfoo  ', ids: [s.pics [0].id, s.pics [1].id], del: true};
   }, 200],
   ['untag #1', 'post', 'tag', {}, function (s) {
      return {tag: '\tfoo  ', ids: [s.pics [0].id, s.pics [1].id], del: true};
   }, 200],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 4})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['get pic after untagging', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (rs.body.pics [0].tags, ['2018'])) return clog ('Invalid tags');
      return true;
   }],
   ['get tagged pic after untagging', 'post', 'query', {}, {tags: ['foo'], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (rs.body.total !== 0) return clog ('Searching by tag does not work.');
      return true;
   }],
   ['tag two pics #1', 'post', 'tag', {}, function (s) {
      return {tag: '  bla', ids: [s.pics [0].id, s.pics [3].id]};
   }, 200],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 2, bla: 2})) return clog (rs.body);
      return true;
   }],
   ['get tagged pics', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (rs.body.pics [0].tags, ['2018', 'bla'])) return clog ('Invalid tags');
      if (! eq (rs.body.pics [3].tags, ['2014', 'bla'])) return clog ('Invalid tags');
      return true;
   }],
   ['get tagged pics again', 'post', 'query', {}, {tags: [], sort: 'oldest', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (! eq (rs.body.pics [0].tags, ['2014', 'bla'])) return clog ('Invalid tags');
      if (! eq (rs.body.pics [3].tags, ['2018', 'bla'])) return clog ('Invalid tags');
      return true;
   }],
   ['untag tag two pics with tag they don\'t have', 'post', 'tag', {}, function (s) {
      return {tag: 'blablabla', ids: [s.pics [0].id, s.pics [3].id], del: true};
   }, 200],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 2, bla: 2})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['untag two pics', 'post', 'tag', {}, function (s) {
      return {tag: 'bla', ids: [s.pics [0].id, s.pics [3].id], del: true};
   }, 200],
   ['get tagged pics after untagging', 'post', 'query', {}, {tags: ['bla'], sort: 'upload', from: 1, to: 4}, 200, function (s, rq, rs) {
      if (rs.body.total !== 0) return clog ('Searching by tag does not work.');
      return true;
   }],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2014: 1, 2017: 1, 2018: 2, all: 4, untagged: 4})) return clog ('Invalid tags', rs.body);
      return true;
   }],
   ['tag two pics #2', 'post', 'tag', {}, function (s) {
      return {tag: 'bla   ', ids: [s.pics [0].id, s.pics [3].id]};
   }, 200],
   ['delete tagged picture', 'delete', function (s) {
      return 'pic/' + s.pics [3].id;
   }, {}, '', 200],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {2017: 1, 2018: 2, all: 3, untagged: 2, bla: 1})) return clog (rs.body);
      return true;
   }],
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      s.pics = rs.body.pics;
      s.cookie0 = s.headers.cookie;
      return true;
   }],
   ['signup for the first time', 'post', 'auth/signup', {}, function (s) {
      return {username: U [1].username, password: U [1].password, token: s.itoken2, email: 'b@b.com'};
   }, 200, function (s, rq, rs) {
      s.vtoken2 = rs.body.token;
      return true;
   }],
   ['verify user', 'get', function (s) {return 'auth/verify/' + s.vtoken2}, {}, '', 302, function (s) {
      s.headers.cookie = s.cookie0;
      return true;
   }],
   ttester ('share pic', 'post', 'share', {}, [
      ['tag', 'string'],
      ['who', 'string'],
      ['del', ['boolean', 'undefined']],
   ]),
   ['share invalid tag', 'post', 'share', {}, {tag: 'all\n\n', who: U [1].username}, 400],
   ['share invalid tag', 'post', 'share', {}, {tag: 'untagged', who: U [1].username}, 400],
   ['share with no such user', 'post', 'share', {}, {tag: 'bla', who: U [1].username + 'a'}, 404],
   ['share a tag with no such user', 'post', 'share', {}, {tag: 'bla', who: U [1].username + 'a'}, 404],
   ['get shared tags before sharing', 'get', 'share', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {sho: [], shm: []})) return clog ('Invalid body', rs.body);
      return true;
   }],
   ['share a tag with yourself', 'post', 'share', {}, {tag: '\n bla \t ', who: H.trim (U [0].username)}, 400, function (s, rq, rs) {
      if (! eq (rs.body, {error: 'self'})) return clog ('Invalid body', rs.body);
      return true;
   }],
   ['share a tag with a user', 'post', 'share', {}, {tag: '\n bla \t ', who: U [1].username}, 200],
   ['share another tag with a user', 'post', 'share', {}, {tag: 'foo:bar', who: U [1].username}, 200],
   ['get shared tags after', 'get', 'share', {}, '', 200, function (s, rq, rs) {
      rs.body.sho.sort (function (a, b) {
         return a [1] > b [1] ? 1 : -1;
      });
      if (! eq (rs.body, {sho: [[U [1].username, 'bla'], [U [1].username, 'foo:bar']], shm: []})) return clog ('Invalid body', rs.body);
      return true;
   }],
   ['unshare tag', 'post', 'share', {}, {tag: 'foo:bar', who: U [1].username, del: true}, 200],
   ['login with valid credentials as user2', 'post', 'auth/login', {}, U [1], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['get shared tags as user2', 'get', 'share', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {shm: [[U [0].username.replace (/^\s+/, '').replace (' \t', ''), 'bla']], sho: []})) return clog ('Invalid body', rs.body);
      return true;
   }],
   ['get pics as user2', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 1) return clog ('user2 should have one pic');
      s.shared = rs.body.pics [0];
      return true;
   }],
   ['get pics as user2 with tag', 'post', 'query', {}, {tags: ['bla'], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 1) return clog ('user2 should have one pic with this tag');
      return true;
   }],
   ['get shared pic as user2', 'get', function (s) {
      return 'pic/' + s.shared.id;
   }, {}, '', 200],
   ['fail getting nonshared pic as user2', 'get', function (s) {
      return 'pic/' + s.pics [0].id;
   }, {}, '', 404],
   ['login with valid credentials as user1', 'post', 'auth/login', {}, U [0], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['tag rotated picture', 'post', 'tag', {}, function (s) {
      return dale.stopNot (s.pics, undefined, function (pic) {
         if (pic.name === 'rotate.jpg') return {tag: '\nrotate', ids: [pic.id]};
      });
   }, 200],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      return true;
   }],
   ['share rotate tag with a user', 'post', 'share', {}, {tag: 'rotate', who: U [1].username}, 200],
   ['login with valid credentials as user2', 'post', 'auth/login', {}, U [1], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['get pics as user2', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 2) return clog ('user2 should have two pics.');
      s.pics2 = rs.body.pics;
      return true;
   }],
   ['get `rotate` pics as user2', 'post', 'query', {}, {tags: ['rotate'], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 1) return clog ('user2 should have one `rotate` pic.');
      return true;
   }],
   dale.go (dale.times (2, 0), function (k) {
      return [
         ['get pic #' + (k + 1), 'get', function (s) {
            return 'pic/' + s.pics2 [k].id;
         }, {}, '', 200],
         k === 1 ? [] : ['get thumb 200 #' + (k + 1), 'get', function (s) {
            return 'thumb/' + s.pics2 [k].t200;
         }, {}, '', 200],
         k === 1 ? [] : ['get thumb 900 #' + (k + 1), 'get', function (s) {
            return 'thumb/' + s.pics2 [k].t200;
         }, {}, '', 200],
      ];
   }),
   ['upload lopsided picture as user2 with invalid tags #1', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'rotate.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: '{}'}
   ]}, 400],
   ['upload lopsided picture as user2 with invalid tags #2', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'rotate.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: '2'}
   ]}, 400],
   ['upload lopsided picture as user2 with invalid tags #3', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'rotate.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: '["hello", 1]'}
   ]}, 400],
   ['upload lopsided picture as user2 with invalid tags #4', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'rotate.jpg'},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: '["hello", "all"]'}
   ]}, 400],
   ['upload lopsided picture as user2', 'post', 'pic', {}, {multipart: [
      {type: 'file',  name: 'pic', path: PICS + 'rotate.jpg'},
      {type: 'field', name: 'uid', value: Date.now ()},
      {type: 'field',  name: 'lastModified', value: Date.now ()},
      {type: 'field',  name: 'tags', value: '["rotate"]'}
   ]}, 200],
   ['get all pics as user2', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 2) return clog ('user2 should have two pics.');
      if (rs.body.total !== 2) return clog ('total not computed properly with repeated pics.');
      if (rs.body.pics [0].id === s.pics2 [0].id) return clog ('user2 should have own picture as priority.');
      s.rotate2 = rs.body.pics [0];
      return true;
   }],
   ['get `rotate` pics as user2', 'post', 'query', {}, {tags: ['rotate'], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 1) return clog ('user2 should have one `rotate` pic.');
      if (rs.body.total !== 1) return clog ('total not computed properly with repeated pics.');
      if (rs.body.pics [0].id === s.pics2 [0].id) return clog ('user2 should have own picture as priority.');
      s.repeated = rs.body.pics [0].id;
      return true;
   }],
   ['share rotate tag with user1', 'post', 'share', {}, {tag: 'rotate', who: U [0].username.replace (/^\s+/, '').replace (' \t', '')}, 200],
   ['get `rotate` pics as user2 after sharing', 'post', 'query', {}, {tags: ['rotate'], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 1) return clog ('user2 should have one `rotate` pic.');
      if (rs.body.pics [0].id === s.pics2 [0].id) return clog ('user2 should have own picture as priority.');
      return true;
   }],
   ['login as user1', 'post', 'auth/login', {}, U [0], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['get `rotate` pics as user1 after sharing', 'post', 'query', {}, {tags: ['rotate'], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 1) return clog ('user1 should have one `rotate` pic.');
      if (rs.body.pics [0].id !== s.pics2 [0].id) return clog ('user1 should have own picture as priority.');
      return true;
   }],
   ['get all pics as user1 after sharing', 'post', 'query', {}, {tags: [], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 3) return clog ('user1 should have one `rotate` pic.');
      return true;
   }],
   ['login as user2', 'post', 'auth/login', {}, U [1], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['unshare user1', 'post', 'share', {}, {tag: 'rotate', who: U [0].username.replace (/^\s+/, '').replace (' \t', ''), del: true}, 200],
   ['login as user1', 'post', 'auth/login', {}, U [0], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['get `rotate` pics as user1 after unsharing', 'post', 'query', {}, {tags: ['rotate'], sort: 'upload', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.pics.length !== 1) return clog ('user1 should have one `rotate` pic.');
      if (rs.body.pics [0].id !== s.pics2 [0].id) return clog ('user1 should have own picture after unsharing.');
      return true;
   }],
   ['login as user2', 'post', 'auth/login', {}, U [1], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   ['delete pic as user2', 'delete', function (s) {
      return 'pic/' + s.rotate2.id;
   }, {}, '', 200],
   ['delete account', 'post', 'auth/delete', {}, {}, 200],
   ['login as user1', 'post', 'auth/login', {}, U [0], 200, function (s, rq, rs) {
      s.headers = {cookie: rs.headers ['set-cookie'] [0]};
      return s.headers.cookie !== undefined;
   }],
   dale.go (dale.times (3, 0), function (k) {
      return ['delete pic #' + (k + 1), 'delete', function (s) {
         return 'pic/' + s.pics [k].id;
      }, {}, '', 200];
   }),
   ['get pics', 'post', 'query', {}, {tags: [], sort: 'newest', from: 1, to: 10}, 200, function (s, rq, rs) {
      if (rs.body.total !== 0) return clog ('Some pictures were not deleted.');
      return true;
   }],
   ['get tags', 'get', 'tags', {}, '', 200, function (s, rq, rs) {
      if (! eq (rs.body, {all: 0})) return clog (rs.body);
      return true;
   }],
   ['unshare as user1 after user2 was deleted', 'post', 'share', {}, {tag: 'bla', who: U [1].username, del: true}, 404],
   ['get account at the end of the test cycle', 'get', 'account', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return clog ('Body must be object');
      if (! eq ({username: 'user 1', email: 'a@a.com', type: 'tier1'}, {username: rs.body.username, email: rs.body.email, type: rs.body.type})) return clog ('Invalid values in fields.');
      if (type (rs.body.created) !== 'integer') return clog ('Invalid created field');
      if (type (rs.body.used) !== 'array' || rs.body.used.length !== 2 || rs.body.used [0] !== 0) return clog ('Invalid used field.');
      if (type (rs.body.logs) !== 'array' || (rs.body.logs.length !== 47 && rs.body.logs.length !== 48)) return clog ('Invalid logs.');
      return true;
   }],
   ['get stats after test', 'get', 'admin/stats', {}, '', 200, function (s, rq, rs) {
      if (type (rs.body) !== 'object') return clog ('Invalid body', rs.body);
      if (rs.body.users !== 1) return clog ('Invalid users');
      if (rs.body.pics !== 0)  return clog ('Invalid pics');
      if (rs.body.bytes !== 0) return clog ('Invalid bytes');
      return true;
   }],
];

h.seq ({port: CONFIG.port}, [
   intro,
   main,
   outro,
], function (error) {
   if (error) {
      if (error.request && error.request.body && type (error.request.body) === 'string') error.request.body = error.request.body.slice (0, 1000) + (error.request.body.length > 1000 ? '... OMITTING REMAINDER' : '');
      return clog ('FINISHED WITH AN ERROR', error);
   }
   clog ('ALL TESTS FINISHED SUCCESSFULLY!');
}, function (test) {
   if (type (test) === 'object') return test;
   if (test [1] === 'post' && test [4]) {
      var b = test [4];
      test [4] = function (s) {
         if (type (b) === 'function') b = b (s);
         if (! s.headers || ! s.headers.cookie) return b;
         if (['auth/signup', 'auth/login', 'auth/recover', 'auth/reset'].indexOf (test [2]) !== -1) return b;
         var b2 = teishi.copy (b);
         if (b2.multipart) b2.multipart.push ({type: 'field', name: 'cookie', value: s.headers.cookie});
         else b2.cookie = s.headers.cookie;
         return b2;
      }
   }
   return h.stdmap (test);
});
