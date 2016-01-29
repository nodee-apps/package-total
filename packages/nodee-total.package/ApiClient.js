'use strict';

var Model = require('nodee-model');

var ApiClient = Model.define('ApiClient', ['RestDataSource'], {});

ApiClient.extendDefaults({
    connection:{
        // baseUrl:'yourapi.com/products',

        // parsing
        dataKey:'data', // data key, if data is property of response object, e.g. { data:..., status:...}
        resourceListKey:'this', // list of resources - if there is no wrapper in response object, so data is resource, resourceKey:'this'
        resourceKey:'this', // single resource data - if there is no wrapper in response object, so data is resource, resourceKey:'this'
        idKey:'id', // key of id, sometimes id is represented by another key, like "_id", or "productId"
        countKey:'pagination.count', // if response contains count
        errorKey:'data', // if response status !== 200, parse errors
        
        // CRUD methods
        one:{ method:'GET' }, // inspect container
        all:{ method:'GET' },
        create:{ method:'POST' },
        update:{ method:'PUT' },
        remove:{ method:'DELETE' }
    },
    options:{
        hasCount: true, // if responses contains count
        autoPaging: false, // will auto request next page if query.limit not reached
        dynamicPageSize: false
    }
});

// build or customize query object
ApiClient.addMethod('buildQuery', function(defaults, reqData){
    var $q = defaults.query || {};
    
    if(defaults.options.limit) $q.$limit = defaults.options.limit;
    if(defaults.options.sort) $q.$sort = defaults.options.sort;
    if(defaults.options.page) $q.$page = defaults.options.page;
    
    return { $q: JSON.stringify($q) };
});

ApiClient.addMethod('buildHeaders', function(defaults, reqData){
    if(this.buildMethod(defaults, reqData) === 'GET') delete defaults.connection.headers['Content-Type'];
    return defaults.connection.headers;
});
