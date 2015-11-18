'use strict';

var Model = require('enterprise-model'),
    pass = require('enterprise-utils').password,
    guid = require('enterprise-utils').guid,
    datasource = framework.config['auth-datasource'] || 'MongoDataSource';

var User = Model.define( 'User', [ datasource ], {
    email:{ isEmail:true },
    roles:{ isArray:true },
    password:{ isString:true, minLength:5, hidden:true },
    lastLoginDT:{ toDate:true },
    //auth_google: { required:false, inlineUpdate:true, model:Auth_google, updateIfUndefined:false }, // TODO: implement updateIfUndefined:false
    disabled:{ isBoolean:true },
    profile:{}, // some profile data, such as name, phone, ...
    forgotPassToken:{ isString:true },
    apiKey:{ isString: true }, // user can have direct access to resources via url
    allowedIP:{ isArray: true }, // allowed IP to access api, if empty, allowed are all IPs
    notes:{ isString: true }
});

var connection = {
    indexes: {
        email: { 'email':1, $options:{ unique:true }},
        apiKey: {'apiKey':1}
    }
};

for(var cfgKey in framework.config){
    var propName = cfgKey.match(/^auth\-datasource\-(.+)/);
    
    if(propName){
        connection[ propName[1] ] = framework.config[cfgKey];
    }
}

// mongo default settings
connection.host = connection.host || framework.config['datasource-primary-host'];
connection.port = connection.port || framework.config['datasource-primary-port'];
connection.database = connection.database || framework.config['datasource-primary-database'] || framework.config.name;
connection.collection = connection.collection || 'users';


User.extendDefaults({
    connection: connection,
    cache:{
        duration: 3*60*1000 // default 3 minutes
    }
});

User.addMethod('validateLogin', function(login, callback){ //callback(err, user || undefined)
    this.collection().find({ email: login.email }).one(function(err, user){
        if(err) callback(new Error('User Model: login validation failed').cause(err));
        else if(user && !user.disabled && pass.validate(user.password, login.password)) {
            callback(null, user);
        }
        else callback();
    });
});

User.on('beforeCreate', function(next){
    var user = this;
    
    // hash password
    if(!user.password) {
        next(new Error('User Model: validation failed').details({ code:'INVALID', validErrs:{ password:['required'] } }));
        return;
    }
    user.hashPass();
    
    // default role is "user"
    user.roles = replaceRoleWhiteSpaces(user.roles || ['user']);
    
    // generate apiKey
    user.apiKey = guid();
    
    next();
});

User.on('beforeUpdate', function(next){
    var user = this;
    
    if(user.roles) user.roles = replaceRoleWhiteSpaces(user.roles);
    user.clearCache(user);
    next();
});

// helper for clearing cached user - useful when logout, or update
User.prototype.clearCache = function(){
    var user = this;
    user.constructor.collection().findId(user.id).clearCache('one');
    user.constructor.collection().find({ apiKey: user.apiKey }).clearCache('one');
};

User.prototype.hashPass = function(password){
    var user = this;
    user.password = pass.hash(password || user.password);
};

User.prototype.changePass = function(oldPassword, newPassword, cb){ // cb(err)
    var user = this;
    user.password = oldPassword;
    
    // get user email
    user.constructor.collection().findId(user.id).one(function(err, user){
        if(err) cb(new Error('User.prototype.changePass: reading user failed').cause(err));
        else if(user) {
            if(pass.validate(user.password, oldPassword)) {
                user.resetPass(newPassword, cb);
            }
            else cb(new Error('User.prototype.changePass: INVALID').details({ code:'INVALID', validErrs:{ password:['invalid'] } }));
        }
        else cb(new Error('User.prototype.changePass: NOTFOUND').details({ code:'NOTFOUND' }));
    });
};

User.prototype.resetPass = function(newPassword, cb){ // cb(err)
    var user = this;
    user.password = newPassword;
    user.hashPass();
    user.update(cb);
};

// helpers
function replaceRoleWhiteSpaces(roles){
    roles = roles || [];
    for(var i=0;i<roles.length;i++){
        if(roles[i]) roles[i].replace(/\s/g, '-');
    }
    return roles;
}