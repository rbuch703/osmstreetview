"use strict"    




var Controller = {

    eye: {},
    position: {},
    localPosition : { x:0, y:0 }, //camera position in the local coordinate system
    viewAngleYaw : {},
    viewAnglePitch : {},


    buildQueryString: function()
    {
        return "?lat="+this.position.lat+
               "&lng="+this.position.lng+
               "&yaw="+this.viewAngleYaw.toFixed(1)+
               "&pitch="+this.viewAnglePitch.toFixed(1);
    },

    initFromQueryString: function(queryString)
    {
        var query = this.toDictionary(queryString);
        if (query.lat && query.lng)
        {
            this.position = {lat:query.lat, lng:query.lng};
            
            if ( ("yaw" in  query) && ("pitch" in query) ) //if look direction is also given
            {
                this.viewAngleYaw = query.yaw;
                this.viewAnglePitch=query.pitch;
            }
        }
    },

    toDictionary: function(queryString)
    {
        var parts = queryString.split("&");
        var res = {};
        for (var i in parts)
        {
            var kv = parts[i].split("=");
            if (kv.length == 2)
            {
                res[kv[0]] = parseFloat(kv[1]);
            }
        }
        return res;
    },
    
    

	onMouseDown: function(e)
	{
	    if (e.button != 0) 
	        return;

	    this.x = e.clientX;
	    this.y = e.clientY;
	    this.down = "mouse";
	},
	
	onMouseUp: function(e)
	{
	    if (e.button != 0) 
	        return;
	    this.down = null;
	},
	
	keysDown: {},
	
	lastKeyEventProcessed: null,
	
	updateKeyInteraction: function()
	{
        var now = new Date().getTime();

        if (this.lastKeyEventProcessed === null)
        {
            this.lastKeyEventProcessed = now;
            return;
        }

        
        var dt = now - this.lastKeyEventProcessed;
        this.lastKeyEventProcessed = now;
        
        var arc = this.viewAngleYaw / 180 * Math.PI;
        var forwardX = Math.sin(arc);
        var forwardY = Math.cos(arc);

        var rightX = Math.sin(arc + Math.PI/2.0);
        var rightY = Math.cos(arc + Math.PI/2.0);
        
        if (this.keysDown.D) { this.localPosition.x += rightX * dt/400; this.localPosition.y += rightY * dt/400;};
        if (this.keysDown.A) { this.localPosition.x -= rightX * dt/400; this.localPosition.y -= rightY * dt/400;};

        if (this.keysDown.W) { this.localPosition.x += forwardX * dt/400; this.localPosition.y +=forwardY * dt/400;}
        if (this.keysDown.S) { this.localPosition.x -= forwardX * dt/400; this.localPosition.y -=forwardY * dt/400;}
	},
	
	x:null,
	y:null,
	//id of the touch event that is currently tracked as 'down'; "mouse" if the mouse is tracked, null if none
    down: null,
    
	onKeyDown: function(evt) 
	{
        //console.log("Key event: key %s", evt.keyCode);
        var key = null;
        switch (evt.keyCode)
        {
            
            case 65: key = "A"; break;
            case 68: key = "D"; break;
            case 83: key = "S"; break;
            case 87: key = "W"; break;
        }
        
        if (key in this.keysDown) //is just a reoccuring event for a key that is still pressed
            return;
            
        this.updateKeyInteraction();
        this.keysDown[key] = key;
        
        if (this.onRequestFrameRender)
            this.onRequestFrameRender();

    },

	onKeyUp: function(evt)
	{
        //console.log("Key event: key %s", evt.keyCode);
        switch (evt.keyCode)
        {
            
            case 65: delete this.keysDown.A; break;
            case 68: delete this.keysDown.D; break;
            case 83: delete this.keysDown.S; break;
            case 87: delete this.keysDown.W; break;
        }
    },
    
    keysStillPressed: function()
    {
        return Object.keys(this.keysDown).length > 0;
    },
	
	updateViewDirection: function(dx, dy)
	{
        this.viewAngleYaw += dx/5 ;
        this.viewAnglePitch += dy/ 5;
        if (this.viewAnglePitch > 180)
            this.viewAnglePitch -= 180;
        
        if (this.viewAnglePitch < -60)
            this.viewAnglePitch = -60;
            
        if (this.viewAnglePitch > 60)
            this.viewAnglePitch = 60;
        /*localPosition.x += dx/100;
        localPosition.y += dy/100;*/

        this.updateHistoryState();
        if (this.onRequestFrameRender)
            this.onRequestFrameRender();
	},
	
    onMouseMove: function(e)
	{
        if (this.down != "mouse" ) return;
        var dx = e.clientX - this.x;
        var dy = e.clientY - this.y;

        this.x = e.clientX;
        this.y = e.clientY;

        //console.log("mouse move this: %s, %o", this, this);
        this.updateViewDirection(dx, dy);
	},

    getTouchData: function(touches, identifier)
    {
        for (var i in touches)
        {
            if (touches[i].identifier == identifier)
            {
                return touches[i];
            }
        }
        return null;
    },
    
    onTouchDown: function(ev)
    {
        ev.preventDefault();
        var touch = ev.changedTouches[0];
        this.down = touch.identifier;
        this.x = touch.clientX;
        this.y = touch.clientY;
    },
    
    onTouchEnd: function(ev)
    {
    
        ev.preventDefault();
        if (this.getTouchData(ev.changedTouches, this.down))
        {
            this.down = null;
        }
    },

    onTouchMove: function(ev)
    {
    
        ev.preventDefault();
        var touch = this.getTouchData(ev.changedTouches, this.down);
        if (touch)
        {
            var dx = touch.clientX - this.x;
            var dy = touch.clientY - this.y;

            /*if (Math.abs(dx) < 5 && Math.abs(dy) < 5)
                return;*/
            this.x = touch.clientX;
            this.y = touch.clientY;
            this.updateViewDirection(dx, dy);
            
        }
    },
    
   
    updateTimeoutId: null,
    // schedules a history state update so that the update is performed once no
    // update request has been made for a second (1000ms). This keeps the history state
    // reasonably up-to-date while preventing excessive history state updates (which incur
    // a performance penalty at least in Firefox).
    updateHistoryState : function()
    {
        if (this.updateTimeoutId)
            window.clearTimeout(this.updateTimeoutId);
        
        this.updateTimeoutId = window.setTimeout( function() 
            {
                var url = document.URL;
                if (url.indexOf("?") >= 0) // already contains a query string --> remove it
                    url = url.substring(0, url.indexOf("?"));
                
                url += Controller.buildQueryString();
                //"?lat="+position.lat+"&lng="+position.lng+"&yaw="+viewAngleYaw.toFixed(1)+"&pitch="+viewAnglePitch.toFixed(1);
                history.replaceState(null, document.title, url);
            },1000);
    }
    
    
}
