/**
 * 渲染器
 */

var Renderer = new function() {

	/**
	 * 渲染组件
	 */
	this.render = function(component){
		
 		renderExpNode(component.$__expNodes);

 		for(var j=component.$__components.length;j--;){
 			Renderer.render(component.$__components[j]);
 		}
	}

	//表达式节点渲染
	function renderExpNode(expNodes){
		var cache = {};
		for(var i=expNodes.length;i--;){
			var expNode = expNodes[i];

			var val = null;
			if(cache[expNode.origin] && cache[expNode.origin].comp === expNode.component){
				val = cache[expNode.origin].val;
			}else{
				val = calcExp(expNode.component,expNode.origin,expNode.expMap);
				cache[expNode.origin] = {
					comp:expNode.component,
					val:val
				}
			}
			
			if(expNode.toHTML){
				var rs = renderHTML(expNode,val,expNode.node,expNode.component);
				if(rs){
					continue;
				}
			}
			if(val !== null){
				updateDOM(expNode.node,expNode.attrName,val);
			}
		}//over for
		
	}
	this.renderExpNode = renderExpNode;

	var propMap = {
		value:['INPUT']
	};

	function updateDOM(node,attrName,val){
		if(node.setAttribute){
			node.setAttribute(attrName,val);
			var propOn = propMap[attrName];
			if(propOn && propOn.indexOf(node.tagName)>-1){
				node[attrName] = val;
			}
		}else{
			if(node.parentNode && node.parentNode.tagName === 'TEXTAREA'){
				node.parentNode.nodeValue = val;
			}
			if(node.parentNode)//for IE11
			//文本节点
			node.nodeValue = val;
		}
	}

	function clone(obj){
		if(obj === null)return null;
		var rs = obj;
		if(obj instanceof Array){
			rs = obj.concat();
			for(var i=rs.length;i--;){
				rs[i] = clone(rs[i]);
			}
		}else if(Util.isObject(obj)){
			rs = {};
			var ks = Object.keys(obj);
            if(ks.length>0){
                for(var i=ks.length;i--;){
                    var k = ks[i],
                        v = obj[k];
                    if(k.indexOf('$__impex__')===0)continue;
                    rs[k] = typeof obj[k]==='object'? clone(obj[k]): obj[k];
                }
            }
		}
		return rs;
	}

	//计算表达式的值，每次都使用从内到外的查找方式
	function calcExp(component,origin,expMap){
		//循环获取每个表达式的值
		var map = {};
		for(var exp in expMap){
			//表达式对象
			var expObj = expMap[exp];
			var rs = evalExp(component,expObj);

			var filters = expObj.filters;
			if(Object.keys(filters).length > 0){
				if(rs && Util.isObject(rs)){
					rs = clone(rs);
				}

				for(var k in filters){
					var c = filters[k][0];
					var params = filters[k][1];
					var actParams = [];
					for(var i=params.length;i--;){
						var v = params[i];
						if(v.varTree && v.words){
							v = Renderer.evalExp(component,v);
						}
						actParams[i] = v;
					}
					c.$value = rs;
					rs = c.to.apply(c,actParams);
				}
			}

			map[exp] = rs===undefined?'':rs;
		}

		//替换原始串中的表达式
		for(var k in map){
			origin = origin.replace(EXP_START_TAG +k+ EXP_END_TAG,map[k]);
		}
		return origin;
	}

	//计算表达式对象
	function evalExp(component,expObj){
		var evalExp = getExpEvalStr(component,expObj);
		var rs = '';
		try{
			rs = eval(evalExp);
		}catch(e){
			LOGGER.debug(e.message + ' when eval "' + evalExp+'"');
		}
		
		return rs;
	}

	this.evalExp = evalExp;

	function getExpEvalStr(component,expObj){
		var varTree = expObj.varTree;
		var expVarPath = {};
		for(var varStr in varTree){
			var varObj = varTree[varStr];

			var path = buildVarPath(component,varObj,varStr);
			expVarPath[varStr] = path;
		}

		var evalExp = joinExpStr(expObj.words,expVarPath);
		return evalExp;
	}
	this.getExpEvalStr = getExpEvalStr;

	//拼接表达式串
	function joinExpStr(words,vMap){
		var evalExp = '';
		for(var i=0;i<words.length;i++){
			var w = words[i];
			if(w instanceof Array){
 				evalExp += vMap[w[0]];
 			}else{
 				evalExp += w;
 			}
		}
		return evalExp;
	}

	function keyWordsMapping(str,component){
        if(str === 'this'){
            return component.__getPath();
        }
    }

	//提供通用的变量遍历方法 
 	//用于获取一个变量表达式的全路径
 	function buildVarPath(component,varObj,varStr){
 		var subVarPath = {};
 		for(var subV in varObj.subVars){
 			var subVar = varObj.subVars[subV];
 			var subPath = buildVarPath(component,subVar,subV);
 			subVarPath[subV] = subPath;
 		}

 		var isKeyword = false;
 		var fullPath = '';
 		for(var i=0;i<varObj.words.length;i++){
 			var w = varObj.words[i];
 			if(w instanceof Array){
 				var keywordPath = keyWordsMapping(varObj.segments[0],component);
                if(keywordPath){
                    isKeyword = true;
                    var exp = new RegExp('^\\.'+varObj.segments[0]);
                    fullPath += w[0].replace(exp,keywordPath);
                }else{
                    fullPath += subVarPath[w[0]] || w[0];
                }
 			}else{
 				fullPath += w;
 			}
 		}
 		var watchPath = '';
 		if(varObj.watchPath){
	 		watchPath = varObj.watchPath;
 		}else{
 			for(var i=0;i<varObj.watchPathWords.length;i++){
	 			var w = varObj.watchPathWords[i];
	 			if(w instanceof Array){
	 				watchPath += subVarPath[w[0]] || w[0];	
	 			}else{
	 				watchPath += w;
	 			}
	 		}
 		}

 		if(watchPath){
 			//watchPath为空时，使用全路径检测控制域
 			component = varInCtrlScope(component,watchPath);
 		}else{
 			component = varInCtrlScope(component,fullPath);
 		}

 		if(isKeyword)return fullPath;
 		return (component?component.__getPath():'self') + fullPath;
 	}

 	function varInCtrlScope(scope,v){
		var findScope = scope;
		while(findScope){
			if(getVarByPath(v,findScope.__getPath()) !== undefined){
				return findScope;
			}
			findScope = findScope.$parent;
		}
	}

	function getVarByPath(path,mPath){
		var varExp = mPath + path;
		var rs = undefined;
		try{
			rs = eval(varExp.replace(/^\./,''));
		}catch(e){}
		return rs;
	}

	function renderHTML(expNode,val,node,component){
		if(expNode.__lastVal === val)return;
		if(node.nodeType != 3)return;
		var nView = new View(null,null,[node]);
		if(Util.isUndefined(expNode.__lastVal)){

			var ph = ViewManager.createPlaceholder('-- [html] placeholder --');
			ViewManager.insertBefore(ph,nView);
			expNode.__lastVal = val;
			expNode.__placeholder = ph;
		}

		if(expNode.__lastComp){
			//release
			expNode.__lastComp.destroy();

			nView = ViewManager.createPlaceholder('');
			ViewManager.insertAfter(nView,expNode.__placeholder);
		}

		if(!Util.isDOMStr(val)){
			val = val.replace(/</mg,'&lt;').replace(/>/mg,'&gt;');
		}

		var subComp = component.createSubComponent(val,nView);
		subComp.init();
		subComp.display();

		expNode.__lastComp = subComp;
		expNode.__lastVal = val;

		return true;
	}
}

