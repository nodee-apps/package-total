'use strict';

var fs = require('fs'),
    model = require('nodee-model'),
    framework = GLOBAL.framework,
    Mail = GLOBAL.Mail;

GLOBAL.eViewEngine = require('nodee-view');
GLOBAL.eUtils = require('nodee-utils');

var rest = require('./rest.js'),
    User = require('./User.js'),
    Auth = require('./Auth.js'),
    ApiClient = require('./ApiClient.js');


// important
module.exports.id = 'nodee-total';
module.exports.name = 'nodee-total';
module.exports.version = '0.6.0';
module.exports.rest = rest;
module.exports.Auth = Auth;

/*
 * Readiness check
 */

// ready state list
module.exports.readyModules = { framework:false, 'nodee-total':false };
module.exports.setReady = function(moduleName, isReady){
    if(arguments.length !== 2) throw new Error('Wrong arguments');
    this.readyModules[moduleName] = isReady;
};

module.exports.isReady = function(moduleName){
    if(moduleName) return this.readyModules[moduleName];
    for(var key in this.readyModules) if(!this.readyModules[key]) return false;
    return true;
};

framework.route('/_ready',function(){
    if(module.exports.isReady()) return this.json(module.exports.readyModules);
    this.status = 500;
    this.json(module.exports.readyModules);
},['get']);

/*
 * Healthy check 
 */

// healthy state list
module.exports.healthyModules = { 'nodee-total':false };
module.exports.setHealthy = function(moduleName, isHealthy){
    if(arguments.length !== 2) throw new Error('Wrong arguments');
    this.healthyModules[moduleName] = isHealthy;
};

module.exports.isHealthy = function(moduleName){
    if(moduleName) return this.healthyModules[moduleName];
    for(var key in this.healthyModules) if(!this.healthyModules[key]) return false;
    return true;
};

framework.route('/_healthy',function(){
    if(module.exports.isHealthy()) return this.json(module.exports.healthyModules);
    this.status = 500;
    this.json(module.exports.healthyModules);
},['get']);

/*
 * Install
 */

module.exports.install = function(){
    // remember views directory ID
    eViewEngine.viewDirId = framework.config['directory-views'].replace(/^\//, '').replace(/\/$/, ''); // /myapp/views/ --> myapp/views
    var viewsDir = process.cwd() + '/' + eViewEngine.viewDirId;
    
    // remember temp directory ID
    eViewEngine.tempDirId = framework.config['directory-temp'].replace(/^\//, '').replace(/\/$/, ''); // /myapp/tmp/ --> myapp/tmp
    
    eViewEngine.init(viewsDir, function(err){
        if(err) throw err;
    });
    
    if(!fs.existsSync(viewsDir)) throw new Error('View engine: init failed, view directory "' +viewsDir+ '" does not exists');
    
    // middleware for parsing nested object from posted req body
    framework.middleware('body2object',body2object);
    
    try {
        var uglify = require('uglify-js');
        
        // Documentation: http://docs.totaljs.com/Framework/#framework.onCompileJS
        framework.onCompileScript = function(filename, content) {
            if(!framework.isDebug) {
                try {
                    return uglify.minify(content, { fromString: true }).code;
                }
                catch(err){
                    return '// Uglify-JS minification error (line ' +err.line+ ', col ' +err.col+ '): ' + 
                           err.message.replace(/«/g,'"').replace(/»/g,'"') + ' \n\n' + content;
                }
            }
            else return content;
        };
    }
    catch(err){
        // console.warn('nodee-total: Node module "uglify-js" not found, client scripts will not be minified');
    }
    
    // include rest generators
    rest.install();
    
    // include auth
    Auth.install();
    
    // init nodee-total
    framework.eval(definition);
    
    // User Transmit API
    require('./UserTransmitAPI.js');
    
    framework.on('ready', function(){
        module.exports.setReady('framework', true);
    });
};

function body2object(req, res, next, options, ctrl) {
    if(ctrl && eUtils.object.isObject(ctrl.body)) {
        
        for(var prop in ctrl.body){
            eUtils.object.setValue(ctrl.body, prop, ctrl.body[prop]);
            if(prop.split('.').length > 1) delete ctrl.body[prop];
        }
    }
    next();
}

function definition(){
    
    // catch all errors to change healthy state
    var onErrorOriginal = Framework.prototype.onError;
    Framework.prototype.onError = function(err, name, uri) {
        var nodee_total = MODULE('nodee-total');
        
        // if nodee-total module does not exists, app will not be ready and healthy
        if(nodee_total) nodee_total.setHealthy(name || uri || 'undefined', false);
        
        // call original error handler
        return onErrorOriginal.call(this, err, name, uri);
    };

    // disable throwing error on Mail.emit('error', cb) with empty listener,
    // sendMail function will callback or throw error
    Mail.on('error', function(err){ });
    
    // address, subject, view, model, callback
    Controller.prototype.sendMail = Framework.prototype.sendMail = sendMail;
    
    // sendMail(to, subject, view, model, [cb])
    // sendMail(to, subject, view, [cb])
    // sendMail(opts, [cb])
    function sendMail(to, subject, view, model, cb){
        var opts = {};
        if(arguments.length===1 || arguments.length===2){
            cb = arguments[1];
            opts = arguments[0] || {};
            to = opts.to || opts.address;
            subject = opts.subject;
            view = opts.view || opts.template;
            model = opts.model;
        }
        else if(typeof arguments[3] === 'function'){
            cb = arguments[3];
            model = {};
        }
        
        opts.to = to || opts.to || opts.address;
        opts.subject = subject || opts.subject;
        opts.template = view || opts.view || opts.template || '';
        opts.model = model || opts.model || opts.viewModel || {};
        opts.attachments = opts.attachment ? [opts.attachment] : (opts.attachments || []);
        
        //opts = {
        //    from:'asda@sd',
        //    name:'asda',
        //    subject: 'asdad',
        //    mailer: 'mailer-primary' 
        //    to: 'vas@email.sk',
        //    template: 'ne: emails/order_trip_updated',
        //    emailData: ... alias data
        //    viewModel: ... alias model
        //    subject: 'Objednávka Upravená - Služobná cesta',
        //    bcc:'',
        //    cc:'info@exitravel.sk'
        //};
        
        /*
         * mailer settings
         */
        var mailerCfgId = (opts.mailer || opts.mailer_prefix || 'mailer-primary')+'-',
            mailerCfg = opts.config || {
                from: opts.from || framework.config[ mailerCfgId+'from' ],
                name: opts.name || opts.as || framework.config[ mailerCfgId+'name' ] || framework.config[ mailerCfgId+'as' ],
                host: opts.host || framework.config[ mailerCfgId+'host' ],
                port: opts.port || framework.config[ mailerCfgId+'port' ],
                secure: opts.secure || framework.config[ mailerCfgId+'secure' ] || false,
                tls: opts.tls || framework.config[ mailerCfgId+'tls' ],
                user: opts.user || framework.config[ mailerCfgId+'user' ],
                password: opts.password || framework.config[ mailerCfgId+'password' ],
                timeout: opts.timeout || framework.config[ mailerCfgId+'timeout' ]
            };
        
        if(!mailerCfg.host) {
            if(cb) cb(new Error('Missing mailer host'));
            else throw new Error('Missing mailer host');
        }
        
        var emailBody = opts.emailBody || opts.body || '';
        if(typeof emailBody === 'function') emailBody = emailBody();
        var emailTemplate = typeof opts.template === 'function' ? opts.template() : opts.template;
        if(emailTemplate && emailTemplate.indexOf('ne:')!==0 && emailTemplate.indexOf('nodee:')!==0) emailTemplate = 'ne:'+emailTemplate;
        
        if(emailBody){
            var model = (opts.config || {}).model || opts.model;
            if(model.$brackets || model.$bracketsData || model.$bracketsModel){
                emailBody = eUtils.template.render(emailBody, model.$brackets || model.$bracketsData || model.$bracketsModel);
            }
        }
        else if(emailTemplate) {
            emailBody = this.view(emailTemplate, opts.model, true);
            if(emailBody instanceof Error) {
                if(cb) cb(new Error('sendEmail: rendering view template failed').cause(emailBody));
                else throw new Error('sendEmail: rendering view template failed').cause(emailBody);
            }
        }
        
        var emailSubject = typeof opts.subject === 'function' ? opts.subject() : opts.subject;
        
        try {
            var message = Mail.create(emailSubject, emailBody);
            
            // from
            message.from(mailerCfg.from, mailerCfg.name);
            
            // to
            if(Array.isArray(opts.to)) for(var i=0;i<opts.to.length;i++) message.to(opts.to[i]);
            else message.to(opts.to);
            
            // cc
            if(Array.isArray(opts.cc)) for(var i=0;i<opts.cc.length;i++) message.cc(opts.cc[i]);
            else if(opts.cc) message.cc(opts.cc);
            
            // bcc
            if(Array.isArray(opts.bcc)) for(var i=0;i<opts.bcc.length;i++) message.bcc(opts.bcc[i]);
            else if(opts.bcc) message.bcc(opts.bcc);
            
            // reply
            if(opts.reply || opts.replyTo) message.reply(opts.reply || opts.replyTo);
            
            // attachment(filename, name)
            for(var i=0;i<(opts.attachments||[]).length;i++){
                if(opts.attachments[i].name)
                    message.attachment(opts.attachments[i].file || opts.attachments[i].fileName || opts.attachments[i].filename,opts.attachments[i].name);
                else
                    message.attachment(opts.attachments[i]);
            }
            
            message.send(mailerCfg.host, mailerCfg, cb);
        }
        catch(err){
            if(cb) cb(err);
            else throw err;
        }
        
        return this;
        
    }
    
    // store reference to original view function
    var origCtrlView = Controller.prototype.view;
    var origFwView = Framework.prototype.view;
    
    Controller.prototype.view = function(){
        if((arguments[0]||'').substring(0,3)!=='ne:' && (arguments[0]||'').substring(0,6)!=='nodee:') origCtrlView.apply(this, arguments);
        else {
            arguments[0] = arguments[0].replace(/^ne:[\s]*/g,'').replace(/^nodee:[\s]*/g,'');
            return view.apply(this, arguments);
        }
    };
    
    Framework.prototype.view = function(){
        if((arguments[0]||'').substring(0,3)!=='ne:' && (arguments[0]||'').substring(0,6)!=='nodee:') origFwView.apply(this, arguments);
        else {
            arguments[0] = arguments[0].replace(/^ne:[\s]*/g,'').replace(/^nodee:[\s]*/g,'');
            return view.apply(this, arguments);
        }
    };
    
    /*
    Response view
    @name {String}
    @model {Object} :: optional
    @headers {Object} :: optional
    @isPartial {Boolean} :: optional
    @containers {Object} :: optional
    return {Controller or String}; string is returned when isPartial == true
    */
    function view(name, model, headers, isPartial, containers) {
        model = model || {};
        containers = containers || {};
        
        var self = this,
            value = '',
            mode = model.$viewMode || model._viewMode || '';
        if(arguments.length === 3 && typeof headers === 'boolean'){
            isPartial = arguments[2];
            headers = null;
        }
        if(arguments.length === 4 && typeof headers === 'boolean'){
            containers = arguments[3];
            isPartial = arguments[2];
            headers = null;
        }
        model.$user = model._user = self.user;
        
        try {
            // load view sync if this is view from package
            if(name[0] === '@') {
                value = eViewEngine.renderSync(eViewEngine.tempDirId, name, model, mode, containers, function(viewName){
                    if(viewName[0]==='@') return viewName.substring(1);
                    else return viewName;
                });
            }
            else value = eViewEngine.render(eViewEngine.viewDirId, name, model, mode, containers);
        }
        catch(err){
            if(framework.isDebug || mode === 'admin'){
                value = 'Cannot render template: ' + err.message + '\n\n' + err.stack + '\n\n';
                for(var prop in err) if(err.hasOwnProperty(prop)) value += prop + ': ' + err[prop] + '\n';
                
                if(isPartial) return value;
                framework.responseContent(self.req, self.res, 500, value, CONTENTTYPE_TEXTPLAIN, self.config['allow-gzip'], headers);
                return self;
            }
            else {
                framework.response500(self.req, self.res, err);
                // self.view500(err);
                return '';
            }
        }
        
        if(model.$brackets || model.$bracketsData || model.$bracketsModel){
            value = eUtils.template.render(value, model.$brackets || model.$bracketsData || model.$bracketsModel);
        }
        
        if(isPartial){ // isParitial indicates that view string will be used for something else than serving page, e.g. send Email, etc...
            return value;
        }
        else {
            // write log on begining, if defined
            if(model.$log) value = model.$log + value;
            
            framework.responseContent(self.req, self.res, self.status, value, CONTENTTYPE_TEXTHTML, self.config['allow-gzip'], headers);
            framework.stats.response.view++;
        }
        
        return self;
    }
    
    /*
    Response xml
    @model {Object}
    @headers {Object} :: optional
    @isPartial {Boolean} :: optional
    @xmlOpts {Object} :: optional - xml rendering options
    return {Controller or String}; string is returned when isPartial == true
    */
    Controller.prototype.xml = framework.xml = function(model, headers, isPartial, xmlOpts) {
        model = model || {};
        var self = this,
            value = '',
            mode = model.$viewMode || model._viewMode || '';
        
        if(typeof headers === 'boolean'){
            xmlOpts = arguments[2];
            isPartial = arguments[1];
            headers = null;
        }
        
        //model.$user = model._user = self.user;
        delete model.$viewMode;
        delete model._viewMode;
        
        try {
            value = eViewEngine.xml(model, xmlOpts);
        }
        catch(err){
            if(framework.isDebug || mode === 'admin'){
                value = 'Cannot render template: ' + err.message + '\n\n' + err.stack + '\n\n';
                for(var prop in err) if(err.hasOwnProperty(prop)) value += prop + ': ' + err[prop] + '\n';
                
                if(isPartial) return value;
                framework.responseContent(self.req, self.res, 500, value, CONTENTTYPE_TEXTPLAIN, self.config['allow-gzip'], headers);
                return self;
            }
            else {
                framework.response500(self.req, self.res, err);
                // self.view500(err);
                return '';
            }
        }
        
        if(isPartial){ // isParitial indicates that view string will be used for something else than serving page, e.g. send Email, etc...
            return value;
        }
        else {
            framework.responseContent(self.req, self.res, self.status, value, 'application/xml', self.config['allow-gzip'], headers);
            framework.stats.response.view++;
        }
        
        return self;
    };
    
    // set nodee-total ready and healthy
    setImmediate(function(){
        var nodee_total = MODULE('nodee-total');
        nodee_total.setReady('nodee-total', true);
        nodee_total.setHealthy('nodee-total', true);
    });
};

//setTimeout(function() {
//    framework.eval(definition);
//    
//    /*
//     * User Transmit API
//     */
//    require('./UserTransmitAPI.js');
//    
//    setTimeout(function(){
//        MODULE('nodee-total');
//    },10);
//}, 0);