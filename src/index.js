var {ParamTrie, ParamBranch} = require('param-trie');
var μ = require('immutable');
var Option = require('fantasy-options');
var curry = require('curry');
var Symbol = require('es6-symbol');

var {Some, None} = Option;
var {Param, Branch} = ParamBranch;

function arrayIter(arr) {
	return {
		[Symbol.iterator]() {
			var i = 0;
			return {
				next() {
					return {
						done: i === arr.length,
						value: arr[i++]
					};
				}
			};
		}
	};
}

function urlToPath(url) {
	return url.split('/').filter((p) => p.length > 0);
}

function toParamBranch(url) {
	return urlToPath(url).map(function(part) {
		return part[0] === ':'? Param(part.slice(1))
		     : /* otherwise */  Branch(part);
	});
}

var chain = (xs, f) => xs.reduce(
	(ys, x) => ys.concat(f(x)),
	[]
);

var toPairs = (map) => Array.isArray(map)? chain(map, toPairs)
                     : /* otherwise */     μ.Map(map).entrySeq().toJS();

var groupPairsUniq = (pairs) => pairs.reduce(
	(groups, [k, v]) => {
		var i = groups.findIndex((m) => !m.has(k));
		return groups.setIn([i >= 0 ? i : groups.size, k], v);
	},
	μ.List()
);

function compileAll(maps) {
	return groupPairsUniq(toPairs(maps)).map(compile).reduce(
		(a, b) => a.merge(b),
		ParamTrie.empty()
	);
}

function compile(map) {
	return ParamTrie.fromMap(map.mapKeys(toParamBranch));
}

function resultToOption(result) {
	return typeof result === 'undefined'? Some({})
	     : result instanceof Option?      result
	     : result === false?              None
	     : /* otherwise */                Some(result);
}

function handleAndFold(args, addParams, results) {
	for(let {value, params} of arrayIter(results)) {
		for(let handler of arrayIter(value)) {
			let result = resultToOption(
				handler(...addParams(params.toJSON(), args))
			);

			if(result instanceof Some) {
				return result;
			}
		}
	}
	return None;
}

var route_ = curry(function route_$(addParams, fourOhFour, map) {
	var trie = compileAll(map);
	var currentTrie = trie;
	function handle$(...args) {
		var [req] = args;
		return handleAndFold(
			args,
			addParams,
			currentTrie.lookup(urlToPath(req.url))
		).fold(
			(a) => a,
			()  => fourOhFour(...args)
		);
	}

	handle$.add = function(moreRoutes) {
		var newTrie = compileAll(moreRoutes);
		currentTrie = currentTrie.merge(newTrie);
	};

	return handle$;
});

function fourOhFour$(req, res) {
	res.statusCode = 404;
	res.end();
}

function addParams$(params, args) {
	return args.concat(params);
}

var with404 = route_(addParams$);
var withParamHandler = (handler) => route_(handler, fourOhFour$);

module.exports = with404(fourOhFour$);
module.exports.withParamHandler = withParamHandler;
module.exports.with404 = with404;
module.exports.route_ = route_;