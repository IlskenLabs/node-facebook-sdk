(function() {
  var BaseFacebook, FNI, FacebookApiError, crypto, qs, rest, _, _s;

  rest = require('restler');

  FacebookApiError = require(__dirname + '/errors/FacebookApiError.coffee');

  crypto = require('crypto');

  _ = require('underscore');

  _s = require('underscore.string');

  qs = require('querystring');

  FNI = new Error('Function not implemented. You must extend this class in order to use it');

  BaseFacebook = (function() {

    BaseFacebook.prototype.VERSION = '3.1.1';

    BaseFacebook.prototype.USER_AGENT = 'facebook-nodgetPeristentDate-3.1';

    BaseFacebook.prototype.DROP_QUERY_PARAMETERS = ['code', 'state', 'signed_request'];

    BaseFacebook.prototype.DOMAIN_MAP = {
      'api': 'https://api.facebook.com/',
      'api_video': 'https://api-video.facebook.com/',
      'api_read': 'https://api-read.facebook.com/',
      'graph': 'https://graph.facebook.com/',
      'graph_video': 'https://graph-video.facebook.com/',
      'www': 'https://www.facebook.com/'
    };

    BaseFacebook.prototype.REST_OPTIONS = {
      headers: {
        'User-Agent': BaseFacebook.USER_AGENT
      }
    };

    function BaseFacebook(config) {
      this.appId = config.appId;
      this.appSecret = config.appSecret;
      this.state = this.getPersistentData('state');
      this.state = this.state || null;
    }

    BaseFacebook.prototype.getAccessToken = function(cb) {
      console.log('::getAccesssToken()');
      if (!this.accessToken) {
        this.accessToken = this.getApplicationAccessToken();
        return this.getUserAccessToken(function(err, user_access_token) {
          if (user_access_token) this.accessToken = user_access_token;
          return cb(err, user_access_token);
        });
      } else {
        return cb(null, this.accessToken);
      }
    };

    BaseFacebook.prototype.getUserAccessToken = function(cb) {
      var access_token, code, signed_request;
      console.log('::getUserAccessToken()');
      signed_request = this.getSignedRequest();
      console.log("after getSignedRequest(): " + signed_request);
      if (signed_request) {
        if (signed_request['oauth_token']) {
          access_token = signed_request['access_token'];
          this.setPersistentData('access_token', access_token);
          return cb(null, access_token);
        } else if (signed_request['code']) {
          code = signed_request['code'];
          return this.getAccessTokenFromCode(code, '', function(err, access_token) {
            if (access_token) {
              this.setPersistentData('code', code);
              this.setPersistentData('access_token', access_token);
            }
            return cb(err, access_token);
          });
        } else {
          this.clearAllPeristentData();
          return cb(null, false);
        }
      } else {
        console.log('before get code');
        code = this.getCode();
        console.log('code: ' + code);
        if (code && code !== getPersistentData('code')) {
          return getAccessTokenFromCode(code, this.getCurrentUrl(), function(err, access_token) {
            if (access_token) {
              this.setPersistentData('code', code);
              this.setPersistentData('access_token', access_token);
            } else {
              this.clearAllPersistentData();
            }
            return cb(err, access_token);
          });
        } else {
          return cb(null, this.getPersistentData('access_token'));
        }
      }
    };

    BaseFacebook.prototype.getUser = function(cb) {
      if (this.user) {
        return cb(null, this.user);
      } else {
        return this.getUserFromAvailableData(cb);
      }
    };

    BaseFacebook.prototype.getUserFromAvailableData = function(cb) {
      var p_access_token, signed_request, user;
      signed_request = this.getSignedRequest();
      if (signed_request) {
        if (signed_request.user_id) {
          this.setPersistentData('user_id', signed_request.user_id);
          return cb(null, signed_request.user_id);
        } else {
          this.clearPersistentData();
          return cb(null, 0);
        }
      } else {
        user = this.getPersistentData('user_id', 0);
        p_access_token = this.getPersistentData('access_token');
        return this.getAccessToken(function(err, access_token) {
          if (access_token && access_token !== this.getApplicationAccessToken() && !(!!user && p_access_token === access_token)) {
            this.getUserFromAccessToken(function(err, user) {
              if (user) {
                return this.setPersistentData('user_id', user);
              } else {
                return this.clearPersistentData();
              }
            });
          }
          return cb(null, user);
        });
      }
    };

    BaseFacebook.prototype.getLoginUrl = function(params) {
      var current_url;
      params = params || {};
      this.establishCSRFTokenState();
      current_url = this.getCurrentUrl();
      if (params['scope'] && _.isArray(params['scope'])) {
        params['scope'] = params['scope'].join(',');
      }
      return this.getUrl('www', 'dialog/oauth', _.extend({
        client_id: this.appId,
        redirect_uri: current_url,
        state: this.state
      }, params));
    };

    BaseFacebook.prototype.getLogoutUrl = function(params) {
      var current_url;
      params = params || params;
      current_url = this.getCurrentUrl();
      return this.getUrl('www', 'logout.php', _.extend({
        next: current_url,
        access_token: this.getAccessToken
      }, params));
    };

    BaseFacebook.prototype.getLoginStatusUrl = function(params) {
      var current_url;
      params = params || {};
      current_url = this.getCurrentUrl();
      return this.getUrl('www', 'extern/login_status.php', {
        'api_key': this.appId,
        'no_session': current_url,
        'no_user': current_url,
        'ok_session': current_url,
        'session_version': 3
      });
    };

    BaseFacebook.prototype.api = function() {
      if (_.isArray(arguments[0])) {
        return this._restserver(arguments[0]);
      } else {
        return this._graph.apply(this, arguments);
      }
    };

    BaseFacebook.prototype.getSignedRequestCookieName = function() {
      return 'fbsr_' + this.appId;
    };

    BaseFacebook.prototype.getMetadataCookieName = function() {
      return 'fbm_' + this.appId;
    };

    BaseFacebook.prototype.getUserFromAccessToken = function(cb) {
      return this.api('/me', function(err, user_info) {
        var id;
        id = 0;
        if (user_info && user_info['id']) id = user_info['id'];
        return cb(err, id);
      });
    };

    BaseFacebook.prototype.getApplicationAccessToken = function() {
      return this.appId + '|' + this.appSecret;
    };

    BaseFacebook.prototype.establishCSRFTokenState = function() {
      if (!this.state) {
        this.state = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
      }
      return this.setPersistentData('state', this.state);
    };

    BaseFacebook.prototype.getAccessTokenFromCode = function(code, redirect_uri, cb) {
      if (code === '') cb(null, false);
      if (redirect_uri === null) redirect_uri = this.getCurrentUrl();
      return this._oauthRequest(this.getUrl('graph', '/oauth/access_token'), {
        'client_id': this.appId,
        'client_secret': this.getAppSecret(),
        'redirect_uri': redirect_uri,
        'code': code
      }, function(err, access_token_response) {
        var response_params, ret;
        if (err) cb(err, null);
        if (access_token_response === '') {
          cb(null, false);
          response_params = qs.parse(access_token_response);
          ret = false;
          if (response_params && response_params['access_token']) {
            ret = response_params['access_token'];
          }
          return cb(null, ret);
        }
      });
    };

    BaseFacebook.prototype._restserver = function(params, cb) {
      params['api_key'] = this.appId;
      params['format'] = 'json-strings';
      return this._oauthRequest(this.getApiUrl(params['method']), params, function(err, result) {
        if (_.isObject(result) && result['error_code']) {
          cb(this.getAPIException(result), result);
        } else if (params['method'] === 'auth.expireSession' || params['method'] === 'auth.revokeAuthorization') {
          this.destroySession();
        }
        return cb(null, result);
      });
    };

    BaseFacebook.prototype.isVideoPost = function(path, method) {
      method = method || 'GET';
      if (method === 'POST' && path.match(/^(\/)(.+)(\/)(videos)$/)) {
        return true;
      } else {
        return false;
      }
    };

    BaseFacebook.prototype._graph = function(path, method, params, cb) {
      var domainKey;
      method = method || 'GET';
      if (_.isArray(method) && !params) {
        params = method;
        method = 'GET';
      }
      params['method'] = method;
      if (this.isVideoPost(path, method)) {
        domainKey = 'graph_video';
      } else {
        domainKey = 'graph';
      }
      return this._oauthRequest(this.getUrl(domainKey, path), params, function(err, result) {
        if (_.isObject(result) && result['error']) {
          return cb(this.getAPIException(result), null);
        } else {
          return cb(null, result);
        }
      });
    };

    BaseFacebook.prototype._oauthRequest = function(url, params, cb) {
      var key, options, value;
      if (!params['access_token']) params['access_token'] = this.getAccessToken();
      options = {};
      for (key in params) {
        value = params[key];
        if (!_.isString(value) && !(value instanceof rest.File)) {
          params[key] = JSON.stringify(value);
        } else if (value instanceof rest.File) {
          options.multipart = true;
        }
      }
      return this.makeRequest(url, params, cb);
    };

    BaseFacebook.prototype.makeRequest = function(url, params, options, cb) {
      var method;
      if (!options) {
        options = {
          multipart: false
        };
      }
      options = _.extend(options, this.REST_OPTIONS);
      method = params.method.toLower();
      delete params.method;
      return rest[method](url).on('success', function(data, response) {
        if (!data) {
          return cb(new FacebookApiException({
            'error_code': 0,
            'error': {
              'message': 'Facebook API call returned no data',
              'type': 'RESTExcpetion'
            }
          }), null);
        } else {
          return cb(null, data);
        }
      }).on('error', function(err) {
        return cb(err, null);
      });
    };

    BaseFacebook.prototype.parseSignedRequest = function(signed_request) {
      var data, encoded_sig, expected_sig, payload, sig, _ref;
      _ref = signed_request.split('.', 2), encoded_sig = _ref[0], payload = _ref[1];
      sig = this.base64UrlDecode(encoded_sig);
      data = JSON.parse(this.base64UrlDecode(payload));
      if (data['algorithm'].toUpper() !== 'HMAC-SHA256') {
        this.errorLog('Unknown algorithm. Expected HMAC-SHA256');
        return null;
      }
      expected_sig = crypto.createHash('sha256').update(payload).digest('binary');
      if (sig !== expected_sig) {
        this.errorLog('Bad Signed JSON signature!');
        return null;
      }
      return data;
    };

    BaseFacebook.prototype.getApiUrl = function(method) {
      var READ_ONLY_CALLS, name;
      READ_ONLY_CALLS = {
        'admin.getallocation': 1,
        'admin.getappproperties': 1,
        'admin.getbannedusers': 1,
        'admin.getlivestreamvialink': 1,
        'admin.getmetrics': 1,
        'admin.getrestrictioninfo': 1,
        'application.getpublicinfo': 1,
        'auth.getapppublickey': 1,
        'auth.getsession': 1,
        'auth.getsignedpublicsessiondata': 1,
        'comments.get': 1,
        'connect.getunconnectedfriendscount': 1,
        'dashboard.getactivity': 1,
        'dashboard.getcount': 1,
        'dashboard.getglobalnews': 1,
        'dashboard.getnews': 1,
        'dashboard.multigetcount': 1,
        'dashboard.multigetnews': 1,
        'data.getcookies': 1,
        'events.get': 1,
        'events.getmembers': 1,
        'fbml.getcustomtags': 1,
        'feed.getappfriendstories': 1,
        'feed.getregisteredtemplatebundlebyid': 1,
        'feed.getregisteredtemplatebundles': 1,
        'fql.multiquery': 1,
        'fql.query': 1,
        'friends.arefriends': 1,
        'friends.get': 1,
        'friends.getappusers': 1,
        'friends.getlists': 1,
        'friends.getmutualfriends': 1,
        'gifts.get': 1,
        'groups.get': 1,
        'groups.getmembers': 1,
        'intl.gettranslations': 1,
        'links.get': 1,
        'notes.get': 1,
        'notifications.get': 1,
        'pages.getinfo': 1,
        'pages.isadmin': 1,
        'pages.isappadded': 1,
        'pages.isfan': 1,
        'permissions.checkavailableapiaccess': 1,
        'permissions.checkgrantedapiaccess': 1,
        'photos.get': 1,
        'photos.getalbums': 1,
        'photos.gettags': 1,
        'profile.getinfo': 1,
        'profile.getinfooptions': 1,
        'stream.get': 1,
        'stream.getcomments': 1,
        'stream.getfilters': 1,
        'users.getinfo': 1,
        'users.getloggedinuser': 1,
        'users.getstandardinfo': 1,
        'users.hasapppermission': 1,
        'users.isappuser': 1,
        'users.isverified': 1,
        'video.getuploadlimits': 1
      };
      name = 'api';
      if (READ_ONLY_CALLS[method.toLower()] === 1) {
        name = 'api_read';
      } else if (method.toLower() === 'video.upload') {
        name = 'api_video';
      }
      return this.getUrl(name, 'restserver.php');
    };

    BaseFacebook.prototype.getUrl = function(name, path, params) {
      var url;
      path = path || '';
      params = params || {};
      url = this.DOMAIN_MAP[name];
      if (path) if (path[0] === '/') path = path.substr(1);
      url += path;
      if (params) url += '?' + qs.stringify(params);
      return url;
    };

    BaseFacebook.prototype.getSignedRequest = function() {
      if (!this.signedRequest) {
        if (this.getRequestParameter('signed_request')) {
          this.signedRequest = this.parseSignedRequest(this.getRequestParameter('signed_request'));
        } else if (this.getCookie(this.getSignedRequestCookieName())) {
          this.signedRequest = this.parseSignedRequest(this.getCookie(this.getSignedRequestCookieName()));
        }
      }
      return this.signedRequest;
    };

    BaseFacebook.prototype.getCode = function() {
      var req_code, req_state;
      console.log('getCode()');
      req_code = this.getRequestParameter('code');
      req_state = this.getRequestParameter('state');
      console.log(this.state);
      if (req_code) {
        console.log('-- got code');
        if (this.state && req_state && this.state === req_state) {
          this.state = null;
          this.clearPersistentData('state');
          return req_code;
        }
      } else {
        this.errorLog('CSRF state token does not match one provided.');
      }
      return false;
    };

    BaseFacebook.prototype.getAPIException = function(result) {
      var e, message;
      e = new FacebookApiException(result);
      switch (e.getType()) {
        case 'OAuthException':
        case 'invalid_token':
        case 'Exception':
          message = e.message;
          if (_s.includes(message, 'Error validating access token') || _s.includes(message, 'Invalid OAuth access token') || _s.includes(message, 'An active access token must be used')) {
            this.destroySession();
          }
      }
      return e;
    };

    BaseFacebook.prototype.errorLog = function(msg) {
      return console.dir(msg);
    };

    BaseFacebook.prototype.base64UrlDecode = function(input) {
      var replace, search;
      search = /\-\_/g;
      replace = '+/';
      return new Buffer(input.replace(search, replace)).toString('base64');
    };

    BaseFacebook.prototype.destroySession = function() {
      var base_domain, cookie_name, metadata;
      this.accessToken = null;
      this.user = null;
      this.signedRequest = null;
      this.clearAllPersistentData();
      cookie_name = this.getSignedRequestCookieName();
      this.removeCookie(cookie_name);
      base_domain = '.' + this.getHost();
      metadata = this.getMetadataCookie();
      if (metadata['base_domain']) base_domain = metadata['base_domain'];
      return this.setCookie(cookie_name, '', 0, '/', base_domain);
    };

    BaseFacebook.prototype.getMetadataCookie = function() {
      var cookie_name, cookie_value, metadata, pair, part, parts, _i, _len;
      cookie_name = this.getMetadataCookieName();
      cookie_value = this.getCookie(cookie_name);
      cookie_value = _s.trim(cookie_valie, '-');
      if (!cookie_value) return {};
      parts = cookie_value.split('&');
      metadata = {};
      for (_i = 0, _len = parts.length; _i < _len; _i++) {
        part = parts[_i];
        pair = part.split('=', 2);
        metadata[decodeURIComponent(pair[0])] = pair.length > 1 ? decodeURIComponent(pair[1]) : '';
      }
      return metadata;
    };

    BaseFacebook.prototype.setPersistentData = function() {
      throw FNI;
    };

    BaseFacebook.prototype.getPersistentData = function() {
      throw FNI;
    };

    BaseFacebook.prototype.clearPersistentData = function() {
      throw FNI;
    };

    BaseFacebook.prototype.clearAllPersistentData = function() {
      throw FNI;
    };

    BaseFacebook.prototype.getCurrentUrl = function() {
      throw FNI;
    };

    BaseFacebook.prototype.setCookie = function(name, value, expire, path, domain) {
      throw FNI;
    };

    BaseFacebook.prototype.removeCookie = function(name) {
      throw FNI;
    };

    BaseFacebook.prototype.getCookie = function(name) {
      throw FNI;
    };

    BaseFacebook.prototype.getDomain = function() {
      throw FNI;
    };

    return BaseFacebook;

  })();

  module.exports = BaseFacebook;

}).call(this);
