"use strict"

function FullScreenButton(element, config)
{
    this.config = config;
    this.config.element = element;
    this.isFullScreen = false;
    
    element.className = "toolButton";
    element.src = config.icon;
	element.addEventListener("click", this.onToggleFullScreen.bind(this), false);

    document.addEventListener("fullscreenchange", this.onFullScreenToogled.bind(this), false);
    document.addEventListener("mozfullscreenchange", this.onFullScreenToogled.bind(this), false);
    document.addEventListener("webkitfullscreenchange", this.onFullScreenToogled.bind(this), false);
    document.addEventListener("MSFullscreenChange", this.onFullScreenToogled.bind(this), false);


}

FullScreenButton.prototype.getFullScreenElement = function() {
    //FIXME: check capitalization of document.fullscreenElement
    return document.fullscreenElement ||    //FIXME: uncertain
           document.mozFullScreenElement || //checked
           document.msFullscreenElement ||  //checked
           document.webkitFullscreenElement; //checked
}

FullScreenButton.prototype.requestFullScreenMode = function(elem)
{
    var requestMethod = elem.requestFullscreen || elem.msRequestFullscreen || elem.mozRequestFullScreen || elem.webkitRequestFullscreen;

    if (requestMethod)
        requestMethod.bind(elem)();
}

FullScreenButton.prototype.exitFullScreenMode = function(elem)
{
    var exitMethod = document.cancelFullScreen ||     //FIXME: untested
                     document.msExitFullscreen ||     // verified
                     document.mozCancelFullScreen ||  // verified
                     document.webkitCancelFullScreen; // verified
    
    //console.log("Fullscreen exit method is %o", exitMethod);
    if (exitMethod)
        exitMethod.bind(document)();
}


FullScreenButton.prototype.onToggleFullScreen = function()
{
    if (!this.isFullScreen)
        this.requestFullScreenMode( this.config.target);
    else
        this.exitFullScreenMode( this.config.target);
}

FullScreenButton.prototype.onFullScreenToogled = function()
{
    console.log("fullscreen toggled");
    this.isFullScreen = (this.getFullScreenElement() === this.config.target);
    this.config.element.src = this.isFullScreen ? this.config.returnIcon : this.config.icon;
    
}


/// =============================================================

function WindowToolBar(element, config)
{
    this.element = element;
    this.config  = config;
    
    for (var i in config.windows)
    {
        var dist = document.createElement("SPAN");
        dist.style.marginLeft = "5px";
        element.appendChild(dist);


        var window = config.windows[i];
        window.img = new Image();
        window.img.className = "toolButton"; 
        window.img.src = window.icon;
        window.img.addEventListener("click", this.createOnClickFunction(window.img));
        window.tabVisible = false;
        element.appendChild(window.img);
        window.target.style.display = "none";
    }
}

WindowToolBar.prototype.getActiveWindow = function ()
{
    for (var i in this.config.windows)
    {
        if (this.config.windows[i].tabVisible)
            return this.config.windows[i];
    }

    return null;
 
}

WindowToolBar.prototype.createOnClickFunction = function(img)
{
    var bar = this;
    return function(ev) { bar.onButtonClicked(bar, img, ev) };
}

WindowToolBar.prototype.onButtonClicked = function(bar, img, ev)
{
    var tabToBeEnabled = null;
    for (var i in this.config.windows)
    {
        var window = this.config.windows[i];
        if (img == window.img && !window.tabVisible)
            tabToBeEnabled = window;
    }
    
    for (var i in this.config.windows)
    {
        var window = this.config.windows[i];
        window.img.className = "toolButton"; 
        window.target.style.display = "none";
        window.tabVisible = false;
    }
    
    if (tabToBeEnabled)
    {
        tabToBeEnabled.img.className = "toolButtonClicked"; 
        tabToBeEnabled.target.style.display = "";
        tabToBeEnabled.tabVisible = true;
        if (tabToBeEnabled.onShow)
            tabToBeEnabled.onShow();
    }
    
    onResize();
    
}

