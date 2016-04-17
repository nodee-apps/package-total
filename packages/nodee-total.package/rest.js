'use_strict';

var Model = require('nodee-model'),
    object = require('nodee-utils').object;

/*
 * helper for generating rest endpoint actions
 *
 * @example:
 *
    // expose all instance and collection methods
    framework.rest('/taxi-orders', 'TaxiOrder', [
    
        { collection:'all', flags:[ 'get' ] },
        { route: '/{id}', collection:'one', flags:[ 'get' ] },
        { single:'create', flags:[ 'post', 'json' ] },
        { single:'update', flags:[ 'put', 'json' ] },
        { single:'remove', flags:[ 'delete', 'json' ] }
        
    ], [ ..default flags.. ]);
    
    // instance method
    framework.rest('/taxi-orders', 'TaxiOrder', { instanceMethod:'update' }, ['put']);
    
    // collection methods
    framework.route('/users', framework.rest.collectionAction('User', 'all'), ['get']); // all
    framework.route('/users/count', framework.rest.collectionAction('User', 'count'), ['get']); // count
    framework.route('/users/exists', framework.rest.collectionAction('User', 'exists'), ['get']); // exists
    framework.route('/users/{id}', framework.rest.collectionAction('User', 'one'), ['get']); // one
    
    // custom collection methods
    framework.route('/users/aggregate', framework.rest.collectionAction('User', 'aggregate'), ['get']);
    
    // single resource - instance methods
    framework.route('/users', framework.rest.instanceAction('User', 'create'), ['post']); // create
    framework.route('/users/{id}', framework.rest.instanceAction('User', 'create'), ['post']); // create
    framework.route('/users/{id}', framework.rest.instenceAction('User', 'update'), ['put']); // update
    framework.route('/users/{id}', framework.rest.instanceAction('User', 'remove'), ['delete']); // remove
    
    // custom instance methods
    framework.route('/users/{id}/getDescendants', framework.rest.instanceAction('User', 'getDescendants'), ['get']);
 */
module.exports.install = function(){
    
    /*
     * totaljs controller has parameters as arguments,
     * copy it to named parameters as ctrl.params
     */
    framework.on('controller', function(ctrl, name) {
        ctrl.params = {};
        // ctrl.uri.path = '/admin/cms/asdasd'
        // ctrl.subscribe.route:
        //      url: [ 'admin', 'cms', 'documents', '{id}', 'move', '{parentId}' ],
        //      param: [ 3, 5 ]
        var route = (ctrl.subscribe || {}).route;
        var path = ctrl.uri.path.split('/');
        path[ path.length-1 ] = path[ path.length-1 ].replace(/\?.*$/,'');
        
        var index, paramName;
        if(route && path){
            for(var i=0;i<route.param.length;i++){
                index = route.param[i];
                paramName = route.url[ index ];
                ctrl.params[ paramName.substring( 1, paramName.length-1 ) ] = decodeURIComponent(path[ index+1 ]).replace(/U\+FF0E/g,'.');
            }
        }
    });
    
    
    /**
     * Rest routes generator
     * @param {String} route
     * @param {String} modelName
     * @param {Object} opts options
     */
    framework.rest = function(route, modelName, opts, flags){
        if(arguments.length === 1){
            opts = arguments[0];
            route = opts.route;
            flags = opts.flags;
            modelName = opts.model || opts.modelName;
        }
        else if(arguments.length === 2 && typeof arguments[1] !== 'string' && arguments[1].__typeof !== 'Model'){
            opts = arguments[1];
            modelName = opts.model || opts.modelName;
            flags = opts.flags;
        }
        else if(arguments.length === 3 && typeof arguments[1] !== 'string' && arguments[1].__typeof !== 'Model'){
            opts = arguments[1];
            flags = opts.flags;
        }
        else if(arguments.length > 4) throw new Error('Wrong arguments');
        
        flags = flags || [];
        opts = opts || {};
        var methods = [];
        methods = Array.isArray(opts) ? opts : (opts.methods || []);
        methods._help = {};
        
        if(typeof route !== 'string') throw new Error('Wrong arguments: missing base route');
        if(typeof modelName !== 'string' && modelName.__typeof !== 'Model') throw new Error('Wrong arguments: missing modelName');
        
        for(var m=0;m<methods.length;m++){
            if(methods[m]._help) {
                methods._help = methods[m];
                continue;
            }
            
            // "single" is alias of "instance"
            methods[m].instance = methods[m].instance || methods[m].single;
            methods[m].route = typeof methods[m].route === 'string' ? methods[m].route : '';
            methods[m].methodName = methods[m].instance || methods[m].collection;
            methods[m].length = methods[m].length || framework['default-request-length'];
            methods[m].timeout = methods[m].timeout || framework['default-request-timeout'];
            
            if(methods[m].instance){
                methods[m].route = (methods[m].route ? route+'/'+methods[m].route : route+'/{id}').replace(/\/\//,'/'); // replace "//" with "/"
                
                framework.route(methods[m].route, framework.rest.instanceAction(modelName, methods[m]), { flags:flags.concat( methods[m].flags || [] ), length:methods[m].length, timeout:methods[m].timeout });
            }
            else if(methods[m].collection){
                methods[m].route = (route+'/'+methods[m].route).replace(/\/\//,'/'); // replace "//" with "/"
                framework.route(methods[m].route, framework.rest.collectionAction(modelName, methods[m]), { flags:flags.concat( methods[m].flags || [] ), length:methods[m].length, timeout:methods[m].timeout });    
            }
            else throw new Error('Method option not recognized, please use "single", or "collection" to scaffold rest endpoint');
        }
        
        // add "_help" route
        framework.route(route + '/_help', function(){
            this.json(methods, null, true);
        }, { flags:flags.concat(methods._help.flags || ['get']), length:methods._help.length, timeout:methods._help.timeout });
    };
    
    /*
     * rest defaults
     */
    framework.rest.defLimit = 50; // default limit
    framework.rest.maxLimit = 500; // max limit
    framework.rest.extractQuery = extractQuery;
    framework.middleware('restquery', function(req, res, next){
        var query = extractQuery(req.query);
        for(var key in query) req.query[ key ] = query[ key ];
        next();
    });
    framework.rest.errResponse = errResponse;
    framework.rest.handleResponse = function(ctrl, model){ // helper for handling json response when errors
        return function(err, data){
            if(err) framework.rest.errResponse.call(ctrl, err, function(err, status, data){
                if(err) ctrl.view500(err);
                else {
                    ctrl.status = status;
                    ctrl.json(data);
                }
            });
            else ctrl.json({ data:data });
        };
    };
    // defaultCallback, configured as total.js controller, but can be overvriten by custom function
    framework.rest.defaultCallback = function(err, statusCode, resData, cb){
        if(err) {
            this.status = 500;
            this.view500(err);
            if(cb) cb.call(this, statusCode, resData); // fail cb
        }
        else {
            this.status = statusCode;
            this.json(resData);
            if(cb) cb.call(this, statusCode, resData); // success cb
        }
    };
    framework.rest.instanceAction = function(modelName, opts, cb){
        return generateAction(instanceAction, modelName, opts, cb);
    };  
    framework.rest.collectionAction = function(modelName, opts, cb){
        return generateAction(collectionAction, modelName, opts, cb);
    };
};

/**
 * extract query helper
 * @param   {object}   query
 * @param   {object}   reservedKeys
 * @returns {object}
 */
function extractFind(query, reservedKeys){
    var find = {};
    for(var key in query){
        if(!reservedKeys[ key ]) {
            find[key] = object.dateStringsToDates( query[key] );
        }
    }
    return find;
}

/**
 * extract query helper
 * @param   {string} value
 * @returns {object}
 */
function tryParse(value){
    if(!value || typeof value !== 'string') return value;
    
    try {
        return JSON.parse(value);
    }
    catch(err){
        return {};
    }
}

/**
 * extracts query from querystring, using format like:
 * yoursite/?$q={ $limit:1, age:{ $gt:30 }, name:'jozef' }, or yoursite/?$limit=1 & name=jozef & ...
 * 
 * @param {Object} query parsed request query string as object
 * @returns {Object}  extracted query
 */
function extractQuery(parsedQString, opts) {
    var query = {};
    opts = opts || {
        defLimit: framework.rest.defLimit,
        maxLimit: framework.rest.maxLimit
    };
    
    var reservedKeys = {
        apikey:true, // reserved for auth
        $sort:true,
        $skip:true,
        $limit:true,
        $q:true,
        $page:true,
        $fields:true,
        $params:true // reserved for custom Model.collection() methods, e.g. aggregation
    };
    
    // ?$q={ $limit:1, age:{ $gt:30 }, name:'jozef' }
    if(parsedQString.$q) {
        try {
            var q = JSON.parse(parsedQString.$q);
            query.$find = extractFind(q, reservedKeys);
            query.$sort = q.$sort || tryParse(parsedQString.$sort);
            query.$skip = q.$skip || parsedQString.$skip;
            query.$limit = q.$limit || parsedQString.$limit;
            query.$page = q.$page || parsedQString.$page;
            query.$fields = q.$fields || tryParse(parsedQString.$fields);
            query.$params = q.$params;
        }
        catch(err){
            query = {};
        }
    }
    
    // ? $limit=1 & name=jozef & ...
    else {
        query = {
            $find: extractFind(parsedQString, reservedKeys),
            $sort: tryParse(parsedQString.$sort),
            $skip: parsedQString.$skip,
            $limit: parsedQString.$limit,
            $page: parsedQString.$page,
            $fields: tryParse(parsedQString.$fields),
            $params: parsedQString.$params
        };
    }
    
    /*
     * calculate skip, limit, page
     */
    query.$limit = parseInt(query.$limit, 10) || opts.defLimit;
    if(query.$limit > opts.maxLimit) query.$limit = opts.maxLimit;
    
    query.$skip = parseInt(query.$skip, 10) || 0;
    query.$page = parseInt(query.$page, 10) || (!query.$skip ? 1 : null);
    if(query.$page > 0) query.$skip = (query.$page - 1)*query.$limit;
    
    return query;
}

/**
 * helper for generating response if error
 * @param {Error} err
 * @param {Function} cb callback(err, statusCode, data)
 */
function errResponse(err, cb, failCb){
    var ctrl = this;
    cb = typeof cb==='function' ? cb : framework.rest.defaultCallback;
    
    /*
     * error codes:
     * INVALID - doc is not valid, error has validErrs property
     * NOTFOUND - doc or doc state not found (if optimistic concurrency)
     * EXECFAIL - datasource returned exception
     * CONNFAIL - datasource connection fail
     */
    if(err.code === 'INVALID') cb.call(ctrl, null, 400, { data: err.validErrs || err.data }, failCb);
    else if(err.code === 'NOTFOUND') cb.call(ctrl, null, 404, { data: null }, failCb);
    else if(err.code === 'EXECFAIL') cb.call(ctrl, null, 409, { data: err.data || err.message }, failCb);
    else if(err.code === 'CONNFAIL') cb.call(ctrl, err, 500, null, failCb); // connection fail is unstable state, let app handle it
    else cb.call(ctrl, err, 500, null, failCb); // error type not recognized, let app handle error
}

/**
 * helper for generating actions
 * @param {Function} restAction action method (instanceAction or collectionAction)
 * @param {String} modelName
 * @param {Object} opts options
 * @param {Function} cb optional callback, if not set using defaultCallback
 * @returns {Function}  action method
 */
function generateAction(restAction, modelName, opts, cb){
    if(typeof modelName !== 'string' && modelName.__typeof !== 'Model') throw new Error('Model restAction: first argument have to be string, or Model constructor');
    if(typeof opts === 'string'){
        opts = { methodName: opts };
    }
    
    cb = typeof cb ==='function' ? cb : framework.rest.defaultCallback;
    opts = opts || {};
    opts.methodName = opts.methodName || opts.method; // method is alias for methodName
    opts.defLimit = opts.defLimit || framework.rest.defLimit; // default limit
    opts.maxLimit = opts.maxLimit || framework.rest.maxLimit; // max limit
    opts.count = opts.count || false;
    opts.cache = { duration:opts.cache === true ? undefined : opts.cache, use:opts.cache ? true : false };
    opts.extractQuery = typeof opts.extractQuery === 'function' ? opts.extractQuery : framework.rest.extractQuery;
    opts.query = opts.query || {};
    opts.body = opts.body || {};
    opts.params = opts.params || {};
    opts.includeHiddenFields = opts.includeHiddenFields || opts.includeHiddenProperties;
    
    // filter function will run after queryExtracted, but before rest action
    var filter = typeof opts.filter === 'function' ? opts.filter : function(ctx, cb){ cb(); };
    
    opts.success = opts.success || opts.onSuccess;
    opts.fail = opts.fail || opts.onFail;
    
    var ModelCnst = modelName.__typeof === 'Model' ? modelName : Model(modelName);
    if(!ModelCnst) throw new Error('Model restAction: cannot find model name "' +modelName+ '"');
    
    // return rest action
    return function(){
        var ctrl = this,
            ctx = {
                methodName: opts.methodName,
                includeHiddenFields: opts.includeHiddenFields,
                
                arguments: Array.prototype.slice.call(arguments,0),
                params: object.extend(true, ctrl.params, opts.params),
                query: object.extend(true, opts.extractQuery(ctrl.query, opts), opts.query),
                body: object.isObject(ctrl.body) ? object.extend(true, ctrl.body, opts.body) : ctrl.body,
                method: ctrl.method || ctrl.req.method,
                ModelCnst: ModelCnst,
                skipValidation: opts.skipValidation,
                afterValidation: typeof (opts.afterValidation || opts.before) === 'function' ? (opts.afterValidation || opts.before) : function(ctx, cb){ cb(); }, // run after parsing body, and validation, but before model method execution
                onInstance: typeof opts.onInstance === 'function' ? opts.onInstance : function(ctx, cb){ cb(); }, // run on instance load, but before action
                access: typeof opts.access === 'function' ? opts.access : function(ctx, cb){ cb(); }, // get filter query for collection and instance search
                success: typeof opts.success === 'function' ? opts.success : null,
                fail: typeof opts.fail === 'function' ? opts.fail : null
            };
        
        // if there is only one argument that is resourceId parameter, exclude it from arguments
        if(ctx.params.id) ctx.arguments = ctx.arguments.slice(1, ctx.arguments.length);
        
        // this is instance method
        filter.call(ctrl, ctx, function(){
            restAction.call(ctrl, ctx, opts, cb); // cb(err, status, data)
        });
    };
}

/**
 * model collection action method
 * @param {Object} ctx action context
 * @param {Object} opts options
 * @param {Object} cb callback (err, status, data)
 */
function collectionAction(ctx, opts, cb){ // cb(err, status, data)
    var ctrl = this,
        ModelCnst = ctx.ModelCnst,
        query = ctx.query,
        hasCount = (ModelCnst.getDefaults().options || {}).hasCount, // if Rest model has count in responses, do not run count more times
        next = false,
        prev = (query.$skip > 0);
    
    // action arguments priority - ctrl.params, query.$params, ctx.body
    var args = ['GET','HEAD','DELETE'].indexOf(ctx.method)!==-1 ? (ctx.arguments.length ? ctx.arguments : (query.$params ? [query.$params]:[])) : [ctx.body];
       
    ctx.access.call(ctrl, ctx, function(err, accessQuery){
        if(err) return errResponse.call(ctrl, err, cb, ctx.fail);
        
        function collQuery(plusLimit){
            plusLimit = plusLimit || 0;

            var q = ModelCnst.collection()
                .extendDefaults({
                    cache:{
                        duration: opts.cache.duration,
                        use: opts.cache.use
                    }
                })
                .find(object.extend(true, query.$find||{}, accessQuery||{}))
                .sort(query.$sort)
                .limit(query.$limit + plusLimit)
                .skip(query.$skip)
                .fields(query.$fields);

            if(typeof q[ ctx.methodName ] !== 'function')
                throw new Error('Model restAction: "' +ModelCnst._name+ '.collection()" has no method "' +ctx.methodName+ '"');

            return q;
        }

        if(ctx.methodName === 'count') collQuery().count(function(err, count){
            if(err) errResponse.call(ctrl, err, cb, ctx.fail);
            else cb.call(ctrl, null, 200, { data:count }, ctx.success);
        });

        else if(ctx.methodName === 'one') collQuery().findId( ctrl.params.id || query.id ).one(function(err, doc){
            if(err) errResponse.call(ctrl, err, cb, ctx.fail);
            else if(!doc) cb.call(ctrl, null, 404, { data: null }, ctx.success);
            else cb.call(ctrl, null, 200, { data: includeHiddenFields(ctx.includeHiddenFields, doc) }, ctx.success);
        });

        // get +1 record to determine that result has next page without count
        else if(ctx.methodName === 'all') collQuery(hasCount ? 0 : 1).all(function(err, docs){
            if(err) errResponse.call(ctrl, err, cb, ctx.fail);
            else {
                if(hasCount){
                    next = Math.ceil((docs.count || 0)/query.$limit) - (query.$page || 0) > 0;
                }
                else if(docs.length === query.$limit+1) {
                    next = true;
                    docs.pop();
                }

                if(opts.count){
                    collQuery().count(function(err, count){
                        if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                        else {
                            var r = {
                                data: includeHiddenFields(ctx.includeHiddenFields, docs),
                                pagination:{
                                    page: query.$page,
                                    pages: Math.ceil((count || 0)/query.$limit),
                                    limit: query.$limit,
                                    next: next,
                                    prev: prev,
                                    count: count
                                }
                            };
                            for(var key in docs) if(key!=='count' && docs.hasOwnProperty(key) && !(key < docs.length)) r[key] = docs[key];
                            cb.call(ctrl, null, 200, r, ctx.success);
                        }
                    });
                }
                else {
                    var r = {
                        data: includeHiddenFields(ctx.includeHiddenFields, docs),
                        pagination:{
                            page: query.$page,
                            pages: Math.ceil((docs.count || 0)/query.$limit),
                            limit: query.$limit,
                            next: next,
                            prev: prev,
                            count: docs.count // restModel has data.count prop if pagination found
                        }
                    };
                    for(var key in docs) if(key!=='count' && docs.hasOwnProperty(key) && !(key < docs.length)) r[key] = docs[key];
                    cb.call(ctrl, null, 200, r, ctx.success);
                }
            }
        });

        // custom collection method with arguments
        else if(args.length){
            var self = collQuery();
            self[ ctx.methodName ].apply(self, args.concat(function(err, result){
                if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                else cb.call(ctrl, null, 200, { data: includeHiddenFields(ctx.includeHiddenFields, result) }, ctx.success);
            }));
        }

        // custom collection method without arguments
        else {
            collQuery()[ ctx.methodName ](function(err, result){
                if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                else cb.call(ctrl, null, 200, { data: includeHiddenFields(ctx.includeHiddenFields, result) }, ctx.success);
            });
        }
    });
}

/**
 * helper for disabling default model toJSON
 * @param   {Boolean}  enable
 * @param   {Object}   result
 * @returns {Object}  result
 */
function includeHiddenFields(enable, result){
    if(!enable) return result;
    
    if(Array.isArray(result)) for(var i=0;i<result.length;i++){
        result[i] = result[i].getData ? result[i].getData() : result[i];
    }
    else result = result.getData ? result.getData() : result;
    return result;
}


/**
 * model instance action method
 * @param {Object} ctx action context
 * @param {Object} opts options
 * @param {Object} cb callback (err, status, data)
 */
function instanceAction(ctx, opts, cb){ // cb(err, status, data)
    var ctrl = this,
        ModelCnst = ctx.ModelCnst,
        query = ctx.query,
        params = ctx.method==='GET' ? query.$params : ctx.body,
        modifiedDT = (query.$params || {}).modifiedDT || (query.$find || {}).modifiedDT,
        resourceId = ctx.params.id;
    
    // action arguments priority - ctrl.params, query.$params, ctx.body
    var args = ['GET','HEAD','DELETE'].indexOf(ctx.method)!==-1 ? (ctx.arguments.length ? ctx.arguments : (query.$params ? [query.$params]:[])) : [ctx.body];
    
    var doc = ctx.model = ctx.doc = ctx.document = ModelCnst.new(object.isObject(ctx.body) ? ctx.body : {});
    // fill resource id
    if(resourceId) doc.id = resourceId;
    
    // if delete method, with optimistic concurrency
    if(ctx.method==='DELETE' && (ModelCnst.getDefaults().options || {}).optimisticLock===true){
        doc.modifiedDT = modifiedDT;
    }
    
    if(!ctx.skipValidation){
        doc.validate();
        if(!doc.isValid()){
            return cb.call(ctrl, null, 400, { data: doc.validErrs() }, ctx.success);
        }
    }
    
    ctx.afterValidation.call(ctrl, ctx, function(err){
        if(err) return errResponse.call(ctrl, err, cb, ctx.fail);
        
        ctx.access.call(ctrl, ctx, function(err, accessQuery){
            if(err) return errResponse.call(ctrl, err, cb, ctx.fail);
            
            if(ctx.methodName === 'create' || ((!opts.onInstance && !accessQuery) && ctx.methodName === 'update')) doc[ ctx.methodName ](function(err, mDoc){
                if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                else cb.call(ctrl, null, 200, { data:mDoc }, ctx.success);
            });

            // same as custom method
            //else if(ctx.methodName === 'remove') doc.remove(function(err){
            //    if(err) errResponse.call(ctrl, err, cb, ctx.fail);
            //    else cb.call(ctrl, null, 200, { data:null }, ctx.success);
            //});

            else if((opts.trust || opts.trustBody) && !opts.access){
                args = ctx.arguments.length ? ctx.arguments : (query.$params ? [query.$params]:[]);
                if(ctx.methodName === 'update') args = []; // update has no arguments, except callback

                // custom instance method with arguments
                if(args.length) {
                    doc[ ctx.methodName ].apply(doc, args.concat(function(err, result){
                        if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                        else cb.call(ctrl, null, 200, { data: includeHiddenFields(ctx.includeHiddenFields, result) }, ctx.success);
                    }));
                }

                // custom instance method without arguments, 
                else doc[ ctx.methodName ](function(err, result){
                    if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                    else cb.call(ctrl, null, 200, { data: includeHiddenFields(ctx.includeHiddenFields, result) }, ctx.success);
                });
            }

            // else find instance by Id and run method
            else ModelCnst.collection().find( object.extend(true, { id:resourceId }, accessQuery||{}) ).one(function(err, doc){
                if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                else if(!doc) return cb.call(ctrl, null, 404, { data: null }, ctx.success);

                ctx.model = ctx.doc = ctx.document = doc;
                ctx.onInstance.call(ctrl, ctx, function(){
                    // change modifiedDT if filled
                    if(modifiedDT && (ModelCnst.getDefaults().options || {}).optimisticLock===true) doc.modifiedDT = modifiedDT;
                    if(ctx.methodName === 'update') args = []; // update has no arguments, except callback

                    // custom instance method with arguments
                    if(args.length) {
                        doc[ ctx.methodName ].apply(doc, args.concat(function(err, result){
                            if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                            else cb.call(ctrl, null, 200, { data: includeHiddenFields(ctx.includeHiddenFields, result) }, ctx.success);
                        }));
                    }

                    // custom instance method without arguments
                    else doc[ ctx.methodName ](function(err, result){
                        if(err) errResponse.call(ctrl, err, cb, ctx.fail);
                        else cb.call(ctrl, null, 200, { data: includeHiddenFields(ctx.includeHiddenFields, result) }, ctx.success);
                    });
                });
            });
             
        });
    });
}
