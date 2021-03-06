/**
 * @classdesc 组件类，包含视图、模型、控制器，表现为一个自定义标签。同内置标签样，
 * 组件也可以有属性。
 * <br/>
 * 组件可以设置事件或者修改视图样式等<br/>
 * 组件实例本身会作为视图的数据源，也就是说，实例上的属性、方法可以在视图中
 * 通过表达式访问，唯一例外的是以$开头的属性，这些属性不会被监控<br/>
 * 组件可以包含组件，所以子组件视图中的表达式可以访问到父组件模型中的值
 * <p>
 * 	组件生命周期
 * 	<ul>
 * 		<li>onCreate：当组件被创建时，该事件被触发，系统会把指定的服务注入到参数中</li>
 * 		<li>onInit：当组件初始化时，该事件被触发，系统会扫描组件中的所有表达式并建立数据模型</li>
 * 		<li>onDisplay：当组件被显示时，该事件被触发，此时组件以及完成数据构建和绑定</li>
 * 		<li>onDestroy：当组件被销毁时，该事件被触发</li>
 * 		<li>onSuspend: 当组件被挂起时，该事件被触发</li>
 * 	</ul>
 * </p>
 * 
 * @class 
 */
function Component (view) {
	var id = 'C_' + im_counter++;
	this.$__id = id;
	this.$__state = Component.state.created;
	/**
	 * 组件绑定的视图对象，在创建时由系统自动注入
	 * 在DOM中，视图对象的所有操作都针对自定义标签的顶级元素，而不包括子元素
	 * @type {View}
	 */
	this.$view = view;
	/**
	 * 组件名，在创建时由系统自动注入
	 */
	this.$name;
	/**
	 * 对父组件的引用
	 * @type {Component}
	 */
	this.$parent;
	this.$__components = [];
	this.$__expNodes = [];
	this.$__expPropRoot = new ExpProp();
	this.$__watcher;
	this.$__events = {};
	/**
	 * 组件模版，用于生成组件视图
	 * @type {string}
	 */
	this.$template;
	/**
	 * 组件模板url，动态加载组件模板
	 */
	this.$templateURL;
	/**
	 * 是否为替换模式生成组件，如果为false，组件模版会插入组件标签内部
	 * @default true
	 * @type {Boolean}
	 */
	this.$replace = true;
	/**
	 * 组件约束，用于定义组件的使用范围包括上级组件限制
	 * <p>
	 * {
	 * 	parents:'comp name' | 'comp name1,comp name2,comp name3...',
	 * 	children:'comp name' | 'comp name1,comp name2,comp name3...'
	 * }
	 * </p>
	 * 这些限制可以单个或者同时出现
	 * @type {Object}
	 */
	this.$restrict;
	/**
	 * 隔离列表，用于阻止组件属性变更时，自动广播子组件，如['x.y','a']。
	 * 
	 * @type {Array}
	 */
	this.$isolate;
	/**
	 * 构造函数，在组件被创建时调用
	 * 如果指定了注入服务，系统会在创建时传递被注入的服务
	 */
	this.onCreate;
	/**
	 * 组件初始化时调用,如果返回false，该组件中断初始化，并销毁
	 */
	this.onInit;
	/**
	 * 组件被显示时调用
	 */
	this.onDisplay;
	/**
	 * 组件被销毁时调用
	 */
	this.onDestroy;
};
Component.state = {
	created : 'created',
	inited : 'inited',
	displayed : 'displayed',
	suspend : 'suspend'
};
function broadcast(comps,type,params){
	for(var i=0;i<comps.length;i++){
		var comp = comps[i];
		var evs = comp.$__events[type];
		var conti = true;
		if(evs){
			conti = false;
			for(var l=0;l<evs.length;l++){
				conti = evs[l].apply(comp,params);
			}
		}
		if(conti && comp.$__components.length>0){
			broadcast(comp.$__components,type,params);
		}
	}
}
Util.ext(Component.prototype,{
	/**
	 * 设置或者获取模型值，如果第二个参数为空就是获取模型值<br/>
	 * 设置模型值时，设置的是当前域的模型，如果当前模型不匹配表达式，则赋值无效<br/>
	 * 获取模型值时，会从当前域向上查找，直到找到匹配对象，如果都没找到返回null
	 * @param  {string} path 表达式路径
	 * @param  {var} val  值
	 * @return this
	 */
	data:function(path,val){
		var expObj = lexer(path);
		var evalStr = Renderer.getExpEvalStr(this,expObj);
		if(arguments.length > 1){
			if(Util.isObject(val) || Util.isArray(val)){
				val = JSON.stringify(val);
			}else 
			if(Util.isString(val)){
				val = '"'+val.replace(/\r\n|\n/mg,'\\n').replace(/"/mg,'\\"')+'"';
			}
			try{
				eval(evalStr + '= '+ val);
			}catch(e){
				LOGGER.debug(e.message + 'eval error on data('+evalStr + '= '+ val +')');
			}
			
			return this;
		}else{
			try{
				return eval(evalStr);
			}catch(e){
				LOGGER.debug(e.message + 'eval error on data('+evalStr +')');
			}
			
		}
	},
	/**
	 * 查找拥有指定属性的最近的上级组件
	 * @param  {String} path 表达式路径
	 * @return {Component}
	 */
	closest:function(path){
		var expObj = lexer(path);
		var evalStr = Renderer.getExpEvalStr(this,expObj);
		evalStr.replace(/^impex\.__components\["(C_[0-9]+)"\]/,'');
		return impex.__components[RegExp.$1];
	},
	/**
	 * 绑定自定义事件到组件
	 * @param  {String} type 自定义事件名
     * @param  {Function} handler   事件处理回调，回调参数[target，arg1,...]
	 */
	on:function(type,handler){
		var evs = this.$__events[type];
		if(!evs){
			evs = this.$__events[type] = [];
		}
		evs.push(handler);
	},
	/**
	 * 触发组件自定义事件，进行冒泡
	 * @param  {String} type 自定义事件名
	 * @param  {...Object} [data...] 回调参数，可以是0-N个  
	 */
	emit:function(){
		var type = arguments[0];
		var params = [this];
		for (var i =1 ; i < arguments.length; i++) {
			params.push(arguments[i]);
		}
		var my = this.$parent;
		setTimeout(function(){
			while(my){
				var evs = my.$__events[type];
				if(evs){
					var interrupt = true;
					for(var i=0;i<evs.length;i++){
						interrupt = !evs[i].apply(my,params);
					}
					if(interrupt)return;
				}				

				my = my.$parent;
			}
		},0);
	},
	/**
	 * 触发组件自定义事件，进行广播
	 * @param  {String} type 自定义事件名
	 * @param  {...Object} [data...] 回调参数，可以是0-N个  
	 */
	broadcast:function(){
		var type = arguments[0];
		var params = [this];
		for (var i =1 ; i < arguments.length; i++) {
			params.push(arguments[i]);
		}
		var my = this;
		setTimeout(function(){
			broadcast(my.$__components,type,params);
		},0);
	},
	/**
	 * 查找子组件，并返回符合条件的所有实例。如果不开启递归查找，
	 * 该方法只会查询直接子节点集合
	 * @param  {String} name       组件名，可以使用通配符*
	 * @param  {Object} conditions 查询条件，JSON对象
	 * @param {Boolean} recur 是否开启递归查找，默认false
	 * @return {Array<Component>} 
	 */
	find:function(name,conditions,recur){
		name = name.toLowerCase();
		var rs = [];
		for(var i=this.$__components.length;i--;){
			var comp = this.$__components[i];
			if(name === '*' || comp.$name === name){
				var matchAll = true;
				if(conditions)
					for(var k in conditions){
						if(comp[k] !== conditions[k]){
							matchAll = false;
							break;
						}
					}
				if(matchAll){
					rs.push(comp);
				}
			}
			if(recur && comp.$__components.length>0){
				var tmp = comp.find(name,conditions,true);
				if(rs)rs = rs.concat(tmp);
			}
		}
		return rs;
	},
	/**
	 * 监控当前组件中的模型属性变化，如果发生变化，会触发回调
	 * @param  {string} expPath 属性路径，比如a.b.c
	 * @param  {function} cbk      回调函数，[变动类型add/delete/update,新值，旧值]
	 */
	watch:function(expPath,cbk){
		if(expPath === '*'){
			this.$__watcher = cbk;
		}else{
			var expObj = lexer(expPath);
			var keys = Object.keys(expObj.varTree);
			if(keys.length < 1)return;
			if(keys.length > 1){
				LOGGER.warn('error on parsing watch expression['+expPath+'], only one property can be watched at the same time');
				return;
			}
			
			var varObj = expObj.varTree[keys[0]];
			var watch = new Watch(cbk,this,varObj.segments);
			//监控变量
			Builder.buildExpModel(this,varObj,watch);
		}

		return this;
	},
	/**
	 * 添加子组件到父组件
	 * @param {Component} child 子组件
	 */
	add:function(child){
		this.$__components.push(child);
		child.$parent = this;
	},
	/**
	 * 创建一个未初始化的子组件
	 * @param  {string} type 组件名
	 * @param  {View} target 视图
	 * @return {Component} 子组件
	 */
	createSubComponentOf:function(type,target){
		var instance = ComponentFactory.newInstanceOf(type,target.__nodes?target.__nodes[0]:target);
		this.$__components.push(instance);
		instance.$parent = this;

		return instance;
	},
	/**
	 * 创建一个匿名子组件
	 * @param  {string | View} tmpl HTML模版字符串或视图对象
	 * @param  {View} target 视图
	 * @return {Component} 子组件
	 */
	createSubComponent:function(tmpl,target){
		var instance = ComponentFactory.newInstance(tmpl,target && target.__nodes[0]);
		this.$__components.push(instance);
		instance.$parent = this;

		return instance;
	},
	/**
	 * 初始化组件，该操作会生成用于显示的所有相关数据，包括表达式等，以做好显示准备
	 */
	init:function(){
		if(this.$__state !== Component.state.created)return;
		impex.__components[this.$__id] = this;

		if(this.$templateURL){
			var that = this;
			Util.loadTemplate(this.$templateURL,function(tmplStr){
				var rs = that.$view.__init(tmplStr,that);
				if(rs === false)return;
				that.__init(tmplStr);
				that.display();
			});
		}else{
			if(this.$template){
				var rs = this.$view.__init(this.$template,this);
				if(rs === false)return;
			}
			this.__init(this.$template);
		}
		return this;
	},
	__init:function(tmplStr){
		Scanner.scan(this.$view,this);

		LOGGER.log(this,'inited');
		
		var rs = null;
		this.onInit && (rs = this.onInit(tmplStr));
		if(rs === false){
			this.destroy();
			return;
		}

		this.$__state = Component.state.inited;
	},
	/**
	 * 显示组件到视图上
	 */
	display:function(){
		if(
			this.$__state !== Component.state.inited && 
			this.$__state !== Component.state.suspend
		)return;

		this.$view.__display(this);
		
		if(this.$__state !== Component.state.suspend){
			Renderer.render(this);
			Builder.build(this);
		}

		this.$__state = Component.state.displayed;
		LOGGER.log(this,'displayed');

		this.onDisplay && this.onDisplay();
	},
	/**
	 * 销毁组件，会销毁组件模型，以及对应视图，以及子组件的模型和视图
	 */
	destroy:function(){
		if(this.$__state === null)return;

		LOGGER.log(this,'destroy');

		if(this.$parent){
			var i = this.$parent.$__components.indexOf(this);
			if(i > -1){
				this.$parent.$__components.splice(i,1);
			}
			this.$parent = null;
		}
		
		this.$view.__destroy(this);

		while(this.$__components.length > 0){
			this.$__components[0].destroy();
		}

		this.$view = 
		this.$__components = 
		this.$__expNodes = 
		this.$__expPropRoot = null;

		this.onDestroy && this.onDestroy();

		if(CACHEABLE && this.$name && !(this instanceof Directive)){
			var cache = im_compCache[this.$name];
			if(!cache)cache = im_compCache[this.$name] = [];

			this.$__state = Component.state.created;
			this.$__components = [];
			this.$__expNodes = [];
			this.$__expPropRoot = new ExpProp();

			cache.push(this);
		}else{
			impex.__components[this.$__id] = null;
			delete impex.__components[this.$__id];

			this.$__impex__observer = 
			this.$__impex__propChains = 
			this.$__state = 
			this.$__id = 
			this.$templateURL = 
			this.$template = 
			this.$restrict = 
			this.$isolate = 
			this.onCreate = 
			this.onInit = 
			this.onDisplay = 
			this.onSuspend = 
			this.onDestroy = null;
		}

	},
	/**
	 * 挂起组件，组件视图会从文档流中脱离，组件模型会从组件树中脱离，组件模型不再响应数据变化，
	 * 但数据都不会销毁
	 * @param {boolean} hook 是否保留视图占位符，如果为true，再次调用display时，可以在原位置还原组件，
	 * 如果为false，则需要注入viewManager，手动插入视图
	 * @see ViewManager
	 */
	suspend:function(hook){
		if(!(this instanceof Directive) && this.$__state !== Component.state.displayed)return;

		LOGGER.log(this,'suspend');
		
		this.$view.__suspend(this,hook===false?false:true);

		this.onSuspend && this.onSuspend();

		this.$__state = Component.state.suspend;
	},
	__getPath:function(){
		return 'impex.__components["'+ this.$__id +'"]';
	}
});