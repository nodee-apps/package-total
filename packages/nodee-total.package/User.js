'use strict';

var Model = require('nodee-model'),
    pass = require('nodee-utils').password,
    guid = require('nodee-utils').guid,
    datasource = framework.config['auth-datasource'] || 'MongoDataSource';

var defaultRoles = framework.config['auth-default-roles'] ? framework.config['auth-default-roles'].split(',') : ['user'];
var defaultAllowedIP = framework.config['auth-default-allowedIP'] ? framework.config['auth-default-allowedIP'].split(',') : null;

var UserProfile = Model.define('UserProfile', {
    language:{ isString:true }, // preffered language
    nickname:{ isString:true },
    firstname:{ isString:true },
    lastname:{ isString:true },
    phone:{ isString:true },
    notes:{ isString: true },
});

var User = Model.define( 'User', [ datasource ], {
    email:{ isEmail:true },
    roles:{ isArray:true },
    password:{ isString:true, minLength:5, hidden:true },
    lastLoginDT:{ toDate:true },
    //auth_google: { required:false, inlineUpdate:true, model:Auth_google, updateIfUndefined:false }, // TODO: implement updateIfUndefined:false
    disabled:{ isBoolean:true },
    forgotPassToken:{ isString:true },
    apiKey:{ isString: true }, // user can have direct access to resources via url
    allowedIP:{ isArray: true }, // allowed IP to access api, if empty, allowed are all IPs
    
    // user profile, some profile data, such as address, phone, etc ...
    profile:{ model: UserProfile },
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

var userCacheDuration = framework.config['auth-users-caching'];
if(userCacheDuration === true) userCacheDuration = 1*60*1000; // default 1 minute

User.extendDefaults({
    connection: connection,
    cache:{
        duration: userCacheDuration || 0
    },
    options:{
        sort:{ createdDT:1 }
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
    
    // check email
    if(!user.email) return next(new Error('User Model: validation failed').details({ code:'INVALID', validErrs:{ email:['required'] } }));
    
    // hash password
    if(!user.password) {
        return next(new Error('User Model: validation failed').details({ code:'INVALID', validErrs:{ password:['required'] } }));
    }
    
    // default role is "user"
    user.roles = replaceRoleWhiteSpaces(user.roles || defaultRoles);
    
    // generate apiKey
    user.apiKey = user.apiKey || guid();
    
    // default allowed api IPs
    if(defaultAllowedIP) user.allowedIP = defaultAllowedIP;
    
    // check user email duplicity (only if using JsonFileDataSource)
    if(datasource !== 'MongoDataSource'){
        user.constructor.collection().find({ $or:[{ email:user.email },{ apiKey:user.apiKey }] }).exists(function(err, exists){
            if(err) return next(err);
            if(exists) return next(new Error('User Model: validation failed').details({ code:'INVALID', validErrs:{ email:['unique'], apiKey:['unique'] } }));
            next();
        });
    }
    else next();
});

User.on('beforeUpdate', function(next){
    var user = this;
    
    if(user.roles) user.roles = replaceRoleWhiteSpaces(user.roles);
    user.clearCache(user);
    
    // check user email duplicity (only if using JsonFileDataSource)
    if(datasource !== 'MongoDataSource'){
        user.constructor.collection().find({ id:{ $ne:user.id }, $or:[{ email:user.email },{ apiKey:user.apiKey }] }).exists(function(err, exists){
            if(err) return next(err);
            if(exists) return next(new Error('User Model: validation failed').details({ code:'INVALID', validErrs:{ email:['unique'], apiKey:['unique'] } }));
            user.clearCache(user);
            next();
        });
    }
    else next();
});

User.on('beforeRemove', function(next){
    var user = this;
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
    return user;
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