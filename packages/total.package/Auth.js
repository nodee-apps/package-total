
var Model = require('enterprise-model'),
    object = require('enterprise-utils').object,
    generateId = require('enterprise-utils').shortId.generate;

// var auth = new Auth({ basePath:'/admin' });
// auth.generateRoutes();

// areas for handling 401, and 403 redirects, e.g. "/admin"
var authAreas = [];

// expose authAreas
Auth.areas = authAreas;

// expose Auth constructor
module.exports = Auth;

/**
 * Authentication constructor
 * @param {String} basePath authentication path, useful when multiple auth areas in one app (e.g. /admin, /eshop, ...)
 */
function Auth(opts){
    opts = opts || {};
    
    var auth = this;
    
    auth.basePath = opts.basePath || '/';
    auth.loginTemplate = opts.loginTemplate || 'login';
    auth.registerTemplate = opts.registerTemplate || 'register';
    auth.userModel = opts.userModel || 'User';
    auth.minLength = opts.minLength || 5;
    auth.registerSuccess = opts.registerSuccess;
    auth.forgotPassTemplate = opts.forgotPassTemplate;
    
    Model(auth.userModel).init();
    
    if(auth.basePath[ auth.basePath.length-1 ] !== '/') auth.basePath += '/';
    
    // register new area, if basePath is defined
    authAreas.push(auth.basePath);
    
    auth.view404 = function(data){
        this.view404();
    };
    
    auth.viewRegister = function(data){
        this.view(auth.registerTemplate, data);
    };

    auth.register = function(){
        var self = this;
        
        // do not accept roles from client on register
        if(self.body) delete self.body.roles;
        
        Model(auth.userModel).new(self.body).create(function(err, user){
            if(err) framework.rest.errResponse(err, function(err, status, data){
                if(err) self.view500(err);
                else {
                    // console.warn(status, data);
                    self.status = status;
                    auth.viewRegister.call(self, data);
                    // self.view(auth.registerTemplate, data);
                }
            });
            else if(auth.registerSuccess) auth.registerSuccess.call(self, user);
            else auth.login.call(self, user);
        });
    };

    auth.viewLogin = function(loginFailed){
        this.view(auth.loginTemplate, { loginFailed: loginFailed });
    };

    auth.login = function(newUser) {
        var self = this;
        
        if(newUser){ // newly registered user, just login and redirect to home page
            // save to cookie
            auth.setSessionCookie.call(self, newUser);
            self.redirect(self.query.redirect || auth.basePath || '/');
        }
        else if(self.body && self.body.email) {
            Model(auth.userModel).validateLogin(self.body, function(err, user){
                if(err) self.view500(err);
                else if(user) {
                    user.lastLoginDT = new Date();
                    user.update(function(err, user){
                        if(err) self.view500(err);
                        else {
                            auth.setSessionCookie.call(self, user);
                            self.redirect(self.query.redirect || auth.basePath || '/');
                        }
                    });
                }
                else auth.viewLogin.call(self, true);
                //self.view(auth.loginTemplate, { loginFailed:true });
            });
        }
        else auth.viewLogin.call(self);
    };

    auth.changepass = function(){
        var self = this,
            pass = self.body || {};
        
        if(self.user && pass.oldPass && pass.newPass){
            if(pass.newPass.length < auth.minLength) {
                self.status = 400;
                self.json({ data:{ password:['minLength'] } });
            }
            else Model(auth.userModel).validateLogin({ email: self.user.email, password: pass.oldPass }, function(err, user){
                if(err) self.view500(err);
                else if(user){
                    user.hashPass(pass.newPass);
                    user.update(function(err, newUser){
                        if(err) self.view500(err);
                        else self.json({ data:'password changed'});
                    });
                }
                else {
                    self.status = 400;
                    self.json({ data:{ password:['invalid'] } });
                }
            });
        }
        else {
            self.status = 400;
            self.json({ data:{ password:['invalid'] } });
        }
    };

    auth.forgotpass = function(){
        var self = this,
            email = (self.body || {}).email;
        
        if(email){
            Model(auth.userModel).collection().find({ email: email }).one(function(err, user){
                if(err) self.view500(err);
                else if(user){
                    // user.forgotPassToken = guid();
                    var new_password = generateId();
                    user.hashPass(new_password);
                    user.update(function(err, newUser){
                        if(err) self.view500(err);
                        else {
                            if(auth.mailerCfg.host && auth.mailerCfg.template){
                                self.sendMail({
                                    config: auth.mailerCfg,
                                    
                                    subject: auth.mailerCfg.subject,
                                    template: auth.mailerCfg.template,
                                    model:{ $brackets: { new_password: new_password } }, //{ token: user.forgotPassToken },
                                    to: user.email
                                });
                            }
                            self.json({ data:'password sent'});
                        }
                    });
                }
                else {
                    self.status = 400;
                    self.json({ data:{ email:['invalid'] } });
                }
            });
        }
        else {
            self.status = 400;
            self.json({ data:{ email:['invalid'] } });
        }
    };
    
    auth.logout = function() {
        var self = this;
        self.res.cookie(self.config['session-cookie-name'], '', new Date().add('y', -1));
        
        // clear cached user
        Model(auth.userModel).new({ id:self.user.id }).clearCache(); 
        self.redirect(auth.basePath || '/');
    };
    
    auth.setSessionCookie = function(user){
        var self = this;
        self.res.cookie(self.config['session-cookie-name'],
                        framework.encrypt({ id: user.id, ip: self.req.ip }, 'user'),
                        {
                            expires: new Date().add('h', self.config['session-cookie-expires'] || 24),
                            secure: self.config['session-cookie-secure'] === false ? false : true,
                            httpOnly: self.config['session-cookie-httpOnly'] === false ? false : true
                        });
        // { Expires: Date, Domain: String, Path: String, Secure: Boolean, httpOnly: Boolean }
    };
    
    var mailerCfgId = (framework.config[ 'auth-mailer-use' ] || (framework.config[ 'auth-mailer-host' ] ? 'auth-mailer' : '') || 'mailer-primary') + '-';
    auth.mailerCfg = {
        from: framework.config[ 'auth-mailer-from' ] || framework.config[ mailerCfgId+'from' ],
        name: framework.config[ 'auth-mailer-name' ] || framework.config[ 'auth-mailer-as' ] || framework.config[ mailerCfgId+'name' ] || framework.config[ mailerCfgId+'as' ],
        host: framework.config[ mailerCfgId+'host' ],
        port: framework.config[ mailerCfgId+'port' ],
        secure: framework.config[ mailerCfgId+'secure' ] || false,
        tls: framework.config[ mailerCfgId+'tls' ],
        user: framework.config[ mailerCfgId+'user' ],
        password: framework.config[ mailerCfgId+'password' ],
        timeout: framework.config[ mailerCfgId+'timeout' ],
        
        template: framework.config[ 'auth-mailer-template' ] || framework.config[ mailerCfgId+'template' ] || auth.forgotPassTemplate,
        subject: framework.config[ 'auth-mailer-subject' ] || framework.config[ mailerCfgId+'subject' ]
    };
    
    auth.mailerCfg = object.extend(true, auth.mailerCfg, opts.mailer || {});
    
    auth.onAuthorization = function(req, res, flags, next) {
        var sessCookie = req.cookie(framework.config['session-cookie-name']);
        var user = framework.decrypt(sessCookie, 'user');
        
        // authKey as query parameter
        var apiKey = (req.query || {}).apikey;
        if(apiKey) user = { apiKey:apiKey, ip:req.ip };
        
        if(!(user && (user.id || user.apiKey))) {
            // unlogged user
            next(false);
            return;
        }
        
        if(user.id && user.ip !== req.ip) {
            // user ip do not match cookies ip - maybe stolen cookies
            next(false);
            return;
        }
        
        var q = Model(auth.userModel).collection().cache();
        if(user.id) q = q.findId(user.id);
        else if(user.apiKey) q = q.find({ apiKey:user.apiKey });
        
        q.one(function(err, user){
            if(err) throw err;
            else if(!user) { // user not found
                next(false);
                return;
            }
            else if(user.disabled) next(false); // user is disabled
            else if(apiKey){ // user found, check if this IP is allowed
                if(!user.allowedIP || !user.allowedIP.length) next(false); // missing allowed IP
                else if(user.allowedIP.indexOf(req.ip)!==-1 || user.allowedIP.indexOf('*')!==-1) next(true, user);
                else next(false); // user found, but request is from not allowed IP
            }
            else {
                next(true, user); // user is logged
            }
        });
    }
}

// helper for generating routes
Auth.prototype.generateRoutes = function(){
    var auth = this;
    
    framework.route(auth.basePath + 'login', auth.viewLogin, ['get']);
    framework.route(auth.basePath + 'login', auth.login, ['post']);
    framework.route(auth.basePath + 'register', auth.viewRegister, ['get']);
    framework.route(auth.basePath + 'register', auth.register, ['post', '#body2object']);
    framework.route(auth.basePath + 'logout', auth.logout, ['authorize']);
    framework.route(auth.basePath + 'changepass', auth.changepass, ['post','json','authorize']);
    framework.route(auth.basePath + 'forgotpass', auth.forgotpass, ['post','json']);
    
    // ensure correct handling of 404
    framework.route(auth.basePath + '*', auth.view404, ['get','authorize']);
    framework.route(auth.basePath + '*', auth.view404, ['post','authorize']);
    framework.route(auth.basePath + '*', auth.view404, ['post','json','authorize']);
    
    // register auth request handler
    framework.onAuthorization = auth.onAuthorization;
};


module.exports.install = function(){

    // register 401 handlers
    framework.route('#401', error401);
    
    // Unauthenticated
    function error401() {
        var self = this;
        var path = self.url, area = '';
        
        for(var i=0;i<Auth.areas.length;i++){
            if(path.indexOf(Auth.areas[i]) === 0) {
                area = Auth.areas[i];
                self.redirect(area + 'login?redirect=' + encodeURIComponent(self.url));
                return;
            }
        }
        
        // login page not found, redirect to
        self.status = 401;
        self.plain('Unauthorized');
    }
    
    // register auth filter
    framework.on('controller', function(ctrl, name) {
        //console.warn('ON CONTROLLER', ctrl.subscribe.route.name, name, ctrl.flags, ctrl.uri.pathname);
        var routeName = ctrl.subscribe.route.name + '/';
        var urlPath = ctrl.uri.pathname + '/';
        
        // FIX: do not allow another route, outside auth area, to handle requests to auth area
        if(routeName.substring(0,2)!=='#4' && routeName.substring(0,2)!=='#5' && !ctrl.req.is401){
            var areaRequest = false, areaRoute = false;
            for(var i=0;i<Auth.areas.length;i++){
                if((urlPath).indexOf(Auth.areas[i]) === 0) { // request inside auth area
                    areaRequest = true;
                    if(routeName.indexOf(Auth.areas[i]) === 0) areaRoute = true; // route from inside auth area
                    break;
                }
            }
            
            if(areaRequest && !areaRoute) {
                ctrl.view401();
                return;
            }
        }
        
        var user = ctrl.user;
        
        // user not defined, unauthenticated request
        if(user === null) return;
        
        // ignore roles when executing #403 route
        if(routeName==='#403') return;
        
        // compare route flags and user.roles
        var routeHasRoles = false;
        for(var i=0;i<ctrl.flags.length;i++){
            var roleFlag = ctrl.flags[i];
            if(roleFlag[0]==='!'){ // role flag, starts with "!"
                routeHasRoles = true;
                roleFlag = roleFlag.slice(1);
                if(user.roles.indexOf(roleFlag) !== -1) return; // role match, user is authorized
            }
        }
        
        // no roles defined in route, so any authenticated user can access it
        if(!routeHasRoles) return;
        
        // cancel executing of controller
        ctrl.cancel();
        
        // redirect
        ctrl.view403();
    });
};