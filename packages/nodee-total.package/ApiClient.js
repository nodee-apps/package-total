'use strict';

var Model = require('nodee-model');

var ApiClient = Model.define('ApiClient', ['RestDataSource'], {
    deleted:{ isBoolean:true }, // if softRemove
    createdDT:{ date:true },
    modifiedDT: { date:true }, // if optimisticLock
});

ApiClient.extendDefaults({
    connection:{
        // baseUrl:'yourapi.com/products',
        // apiKey:'132asdas12234',

        redirects:0,
        
        // parsing
        dataKey:'data', // data key, if data is property of response object, e.g. { data:..., status:...}
        resourceListKey:'this', // list of resources - if there is no wrapper in response object, so data is resource, resourceKey:'this'
        resourceKey:'this', // single resource data - if there is no wrapper in response object, so data is resource, resourceKey:'this'
        idKey:'id', // key of id, sometimes id is represented by another key, like "_id", or "productId"
        countKey:'pagination.count', // if response contains count
        errorKey:'data', // if response status !== 200, parse errors
        
        // CRUD methods
        one:{ method:'GET', url:'/{id}' },
        all:{ method:'GET', url:'/', },
        create:{ method:'POST', url:'/{id}', },
        update:{ method:'PUT', url:'/{id}', },
        remove:{ method:'DELETE', url:'/{id}', returnsResource:false, sendBody:false }
    },
    options:{
        limit: 50,
        hasCount: true, // if responses contains count
        autoPaging: true, // will auto request next page if query.limit not reached
        dynamicPageSize: false,
        simulateInlineUpdate: false, // this will read all documents that match query, than for each exec update (if false, it will perform only update)
        simulateInlineRemove: true // same as simulateInlineUpdate but for remove
    }
});

// build or customize query object
ApiClient.addMethod('buildQuery', function(defaults, reqData){
    var $q = defaults.query || {};
    
    if(defaults.options.fields) $q.$fields = defaults.options.fields;
    if(defaults.options.skip) $q.$skip = defaults.options.skip;
    if(defaults.options.limit) $q.$limit = defaults.options.limit;
    if(defaults.options.sort) $q.$sort = defaults.options.sort;
    if(defaults.options.page) $q.$page = defaults.options.page;
    
    // ensure it will work even if optimistic lock is on
    if(defaults.connection.command === 'remove' && reqData.modifiedDT) $q.modifiedDT = reqData.modifiedDT;
    
    return { apikey: defaults.connection.apiKey, $q: JSON.stringify($q) };
});

//ApiClient.addMethod('buildHeaders', function(defaults, reqData){
//    if(this.buildMethod(defaults, reqData) === 'GET') delete defaults.connection.headers['Content-Type'];
//    return defaults.connection.headers;
//});
