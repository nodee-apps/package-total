var Model = require('nodee-model');

var transmitBasePath = framework.config['transmit-base-path'] || '/_transmit';

var UserTransmitAPI = Model.define( 'UserTransmitAPI', [ 'ApiClient' ], Model('User').getSchema());
UserTransmitAPI.extendSchema({
    password:{ hidden:false }, // show password
});

UserTransmitAPI.extendDefaults({
    connection:{
        basePath: transmitBasePath + '/users',
    },
    options:{
        hasCount: false, // if responses contains count
        autoPaging: true, // will auto request next page if query.limit not reached
        dynamicPageSize: false
    }
});

UserTransmitAPI.transmitPriority = 100;
UserTransmitAPI.transmitQuery = {};
UserTransmitAPI.transmitFields = {};

/*
 * Publish Rest APIs
 */

framework.rest(transmitBasePath +'/users', 'User', [
    { route:'/', collection:'all', includeHiddenFields:true, flags:[ 'get', '!transmit_download' ] },
    { route:'/{id}', instance:'create', flags:[ 'post', 'json' ] },
    { route:'/{id}', instance:'update', flags:[ 'put', 'json' ] },
    { route:'/{id}', instance:'remove', flags:[ 'delete' ] }
], ['authorize','!transmit','!transmit_upload']);
