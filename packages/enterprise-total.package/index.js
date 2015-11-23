'use strict';

var fs = require('fs'),
    model = require('enterprise-model'),
    framework = GLOBAL.framework,
    Mail = GLOBAL.Mail;

GLOBAL.eViewEngine = require('enterprise-view');
GLOBAL.eUtils = require('enterprise-utils');

var rest = require('./rest.js'),
    User = require('./User.js'),
    Auth = require('./Auth.js'),
    ApiClient = require('./ApiClient.js');


// important
module.exports.id = 'enterprise-total';
module.exports.name = 'enterprise-total';
module.exports.version = '0.6.0';
module.exports.rest = rest;
module.exports.Auth = Auth;

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
            if(!framework.isDebug) return uglify.minify(content, { fromString: true }).code;
            else return content;
        };
    }
    catch(err){
        console.warn('enterprise-total: Node module "uglify-js" not found, client scripts will not be minified');
    }
    
    // include rest generators
    rest.install();
    
    // include auth
    Auth.install();
    
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

var definition = function() {
    
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
        
        opts.template = view || opts.template;
        opts.to = to || opts.to || opts.address;
        opts.subject = subject || opts.subject;
        opts.template = view || opts.view || opts.template || '';
        if(opts.template && opts.template.indexOf('e:')!==0 && opts.template.indexOf('enterprise:')!==0) opts.template = 'e:'+opts.template;
        opts.model = model || opts.model || opts.viewModel || {};
        opts.attachments = opts.attachment ? [opts.attachment] : (opts.attachments || []);
        
        //opts = {
        //    from:'asda@sd',
        //    name:'asda',
        //    subject: 'asdad',
        //    mailer: 'mailer-primary' 
        //    to: 'vas@email.sk',
        //    template: 'e: emails/order_trip_updated',
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
                from: framework.config[ mailerCfgId+'from' ] || opts.from,
                name: framework.config[ mailerCfgId+'name' ] || framework.config[ mailerCfgId+'as' ] || opts.name || opts.as,
                host: framework.config[ mailerCfgId+'host' ] || opts.host,
                port: framework.config[ mailerCfgId+'port' ] || opts.port,
                secure: framework.config[ mailerCfgId+'secure' ] || opts.secure || false,
                tls: framework.config[ mailerCfgId+'tls' ] || opts.tls,
                user: framework.config[ mailerCfgId+'user' ] || opts.user,
                password: framework.config[ mailerCfgId+'password' ] || opts.password,
                timeout: framework.config[ mailerCfgId+'timeout' ] || opts.timeout
            };
        if(!mailerCfg.host) {
            if(cb) cb(new Error('Missing mailer host'));
            else throw new Error('Missing mailer host');
        }
        
        var emailBody = opts.emailBody || opts.body || '';
        if(!emailBody && opts.template) {
            emailBody = this.view(opts.template, opts.model, true);
            if(emailBody instanceof Error) {
                if(cb) cb(new Error('sendEmail: rendering view template failed').cause(emailBody));
                else throw new Error('sendEmail: rendering view template failed').cause(emailBody);
            }
        }
        
        try {
            var message = Mail.create(opts.subject, emailBody);
            
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
        if((arguments[0]||'').substring(0,2)!=='e:' && (arguments[0]||'').substring(0,11)!=='enterprise:') origCtrlView.apply(this, arguments);
        else {
            arguments[0] = arguments[0].replace(/^e:[\s]*/g,'').replace(/^enterprise:[\s]*/g,'');
            return view.apply(this, arguments);
        }
    };
    
    Framework.prototype.view = function(){
        if((arguments[0]||'').substring(0,2)!=='e:' && (arguments[0]||'').substring(0,11)!=='enterprise:') origFwView.apply(this, arguments);
        else {
            arguments[0] = arguments[0].replace(/^e:[\s]*/g,'').replace(/^enterprise:[\s]*/g,'');
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
};

setTimeout(function() {
    framework.eval(definition);
}, 0);