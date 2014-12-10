"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

//var map;
var mapPlane;
var mapBuildings;
var mapSkyDome;
//var mapSun;
var myToolbar;
var gl;
var fieldOfView = 90/16*9;

var mqSaveSpace = window.matchMedia( "(max-width: 799px), (max-height: 799px)" );
var mqLandscape = window.matchMedia( "(orientation: landscape)" );

function initEventHandler()
{
   /* prevention of default event handling is required for:
     * - 'mousedown': otherwise dragging the mouse cursor beyond the canvas would select the page text in chrome
     * - 'keydown': otherwise using the cursor keys for navigation would also scroll the page
     */

    webGlCanvas.addEventListener("mousedown",   function(ev) {ev.preventDefault(); Controller.onMouseDown(ev);}, false);
    webGlCanvas.addEventListener("mouseup",     function(ev) {Controller.onMouseUp(ev);},   false);
    webGlCanvas.addEventListener("mouseout",    function(ev) {Controller.onMouseUp(ev);},   false);
    webGlCanvas.addEventListener("mousemove",   function(ev) {Controller.onMouseMove(ev);}, false);
    webGlCanvas.addEventListener("touchstart",  function(ev) {Controller.onTouchDown(ev);}, false);
    webGlCanvas.addEventListener("touchcancel", function(ev) {Controller.onTouchEnd(ev);},  false);
    webGlCanvas.addEventListener("touchend",    function(ev) {Controller.onTouchEnd(ev);},  false);
    webGlCanvas.addEventListener("touchleave",  function(ev) {Controller.onTouchEnd(ev);},  false);
    webGlCanvas.addEventListener("touchmove",   function(ev) {Controller.onTouchMove(ev);}, false);

    document.addEventListener("keydown", function(ev) { if (ev.keyCode == 38 || ev.keyCode == 40) ev.preventDefault(); Controller.onKeyDown(ev);},  false);
    document.addEventListener("keyup",   function(ev) {Controller.onKeyUp(ev);},  false);
	document.body.onresize = onResize;

	sampleLocations.addEventListener("change", onSampleLocationSelected);
	tileSetSelection.addEventListener("change", onTileSetSelected);
    Controller.onRequestFrameRender = scheduleFrameRendering;
    
    
}

function resetPosition(pos )
{
    if (!gl)
        return;

    Controller.position = pos;
    Controller.localPosition.x = 0;
    Controller.localPosition.y = 0;
    Controller.updateHistoryState();

    VicinityMap.resetView(pos);
//    if (glu.performShadowMapping)
//        mapSun = new Sun( Controller.position );
        
    //initialize mapSun date/time
//    onSunPositionChanged( jQuery( "#slider-day" ).slider( "value"), jQuery( "#slider-time" ).slider( "value"));

    if (!mapBuildings)
    {
        mapBuildings = new Buildings(gl, Controller.position);
        mapBuildings.onLoaded = scheduleFrameRendering;
    } else
    {
        mapBuildings.shiftGeometry(Controller.position);
        mapBuildings.requestGeometry(Controller.position);
    }


    var tileSet = getTileSet( tileSetSelection.value);
    
    if (!mapPlane)
    {
        mapPlane = new MapLayer(tileSet, Controller.getEffectivePosition());
        mapPlane.onProgress = scheduleFrameRendering;
    }
    else
        mapPlane.updateTileGeometry( pos );
        mapPlane.createTileHierarchy( tileSet, Controller.getEffectivePosition());
    

    initEventHandler();
    
    scheduleFrameRendering();

}    
/*
function onSunPositionChanged(day, time)
{
    if (!mapSun)
        return;
        
    mapSun.setMomentInTime(day, time);
    
    var riseTime = mapSun.getSunriseTime();
    if (riseTime == null) riseTime = 0.0;
    
    var setTime = mapSun.getSunsetTime();
    if (setTime == null) setTime = 24.0;
    
    jQuery( "#slider-time" ).slider("option", "min", riseTime);
    jQuery( "#slider-time" ).slider("option", "max", setTime);
    
    lblDay.textContent = getDayString(day);
    var hour = time | 0;
    var minute = ""+ ((time - hour)*60).toFixed(0);
    while (minute.length < 2) 
        minute = "0" + minute;

   lblTime.textContent =  "" + hour + ":" + minute;
   
   if (time == riseTime)
    lblTime.textContent += " (sunrise)";
    
   if (time == setTime)
    lblTime.textContent += " (sunset)";

    
    scheduleFrameRendering();
}*/
    
function onNewEyeHeight(newHeight)
{
    //console.log("new eye height is %s", newHeight);
    Controller.localPosition.z = newHeight;
    Controller.updateHistoryState();
    scheduleFrameRendering();
}
    
function onSampleLocationSelected(e)
{
    if (sampleLocations.value !== "dummy")
    {
        var pos = JSON.parse(sampleLocations.value);

        if ("yaw" in pos)
            Controller.viewAngleYaw = pos.yaw;
        if ("pitch" in pos)
            Controller.viewAnglePitch = pos.pitch;

        if ("lat" in pos && "lng" in pos)
        {
            resetPosition( {"lat": pos["lat"], "lng": pos["lng"]} );
        }
    }
}

function getTileSet(tileSetName)
{
    if (tileSetName == "MapLayer.TileSets.OSM")
        return MapLayer.TileSets.OSM;
    
    if (tileSetName == "MapLayer.TileSets.MapQuestOpen")
        return MapLayer.TileSets.MapQuestOpen;
        
    if (tileSetName == "MapLayer.TileSets.MapQuestOpenSatUS")
        return MapLayer.TileSets.MapQuestOpenSatUS;
        
    return null;
}
 
function onTileSetSelected()
{
    if (!!mapPlane)
    {
        var tileSet = getTileSet( tileSetSelection.value);
        
        mapPlane.createTileHierarchy( tileSet, Controller.getEffectivePosition(), Controller.getLocalPosition()[2]);
    }
} 
    
function init()
{
    var idx = document.URL.indexOf("?");

    //Controller.position = {"lat": 52.13940000, "lng": 11.63960000};

    if (idx > 0)
        Controller.initFromQueryString(document.URL.substring(idx + 1));
    else
        Controller.initFromQueryString('lat=40.7683&lng=-73.9794&yaw=261&pitch=14');
    
    initGl();  //initialize webGL canvas
    if (!gl)
        return;
   
    Shaders.init(errorLog);

/*
    var date = new Date(Date.now());
    
    jQuery( "#slider-day" ).slider({
        min: 0,
        max: 364,
        value: getDayOfYear(date),
        step:1,
        stop:  function( event, ui ) { onSunPositionChanged( ui.value, mapSun.time); },
        slide: function( event, ui ) { onSunPositionChanged( ui.value, mapSun.time); }
        });

    jQuery( "#slider-time" ).slider({
        min: 0,
        max: 24,
        value: date.getHours() + 1/60* date.getMinutes(),
        step:0.01,
        stop:  function( event, ui ) { onSunPositionChanged(mapSun.dayOfYear, ui.value); },
        slide: function( event, ui ) { onSunPositionChanged(mapSun.dayOfYear, ui.value); }
        });*/

    //console.log("Local height is %s", Controller.localPosition.z);
    jQuery( "#slider-height" ).slider({
        "min": 10,
        "max": 200,
        "value": Math.sqrt(Controller.localPosition.z*100),
        "step":0.5,
        "stop":  function( event, ui ) { onNewEyeHeight((ui.value*ui.value)/100); },
        "slide": function( event, ui ) { onNewEyeHeight((ui.value*ui.value)/100); }
        });


    //disallow slider manipulation via keyboard, as keyboard input is alredy used for movement inside the scene
    jQuery("#slider-height .ui-slider-handle")["unbind"]('keydown');    
    //jQuery("#slider-day .ui-slider-handle")["unbind"]('keydown');    
    //jQuery("#slider-time .ui-slider-handle")["unbind"]('keydown');    

    VicinityMap.init("mapDiv", Controller.position.lat, Controller.position.lng);
    resetPosition(Controller.position)

	var tmp = new FullScreenButton( btnFullScreen, 
	    {target:dummy, 
	    icon:       "images/ic_action_full_screen.png",
	    returnIcon: "images/ic_action_return_from_full_screen.png"});

    var toolbarEntries = [
        {icon: "images/ic_action_place.png", target:mapDiv, onShow:function(){VicinityMap.onChangeSize(); }},
        {icon: "images/ic_action_settings.png", target: divSettings},
        {icon: "images/ic_action_help.png", target: divUsageNotes}
    ];
              

    myToolbar = new WindowToolBar( toolbarDiv, { windows: toolbarEntries });
    
    mqSaveSpace.addListener(onResize);
    mqLandscape.addListener(onResize);
    onResize();


}   

var frameRenderingScheduled = false;
function scheduleFrameRendering()
{
    if (frameRenderingScheduled)
        return;

    frameRenderingScheduled = true;
    if (window.requestAnimationFrame)
        window.requestAnimationFrame(executeFrameRendering);
    else
        executeFrameRendering();
}

function executeFrameRendering()
{
    frameRenderingScheduled = false;

    if (Controller.position.lat === undefined || Controller.position.lng === undefined)
        return;

    
    // If at least one key is still pressed, schedule rendering of the next frame right away:
    // A pressed key will potentially change the scene and require a re-rendering
    if (Controller.keysStillPressed())
        scheduleFrameRendering();

    if (Controller.keysStillPressed())
        Controller.updateKeyInteraction();

    VicinityMap.updatePositionMarker( Controller.getEffectivePosition() );
    VicinityMap.renderFrustum();
    renderScene();
    
}


/**
 * Initialises WebGL and creates the 3D scene.
 */
function initGl()
{
    //create context
	gl = webGlCanvas.getContext("webgl") || webGlCanvas.getContext("experimental-webgl");
	if(!gl)
	{
	    //remove controls that depend on webGL, and show error messages
        glErrorDiv.style.display = "inherit";
        navDiv.style.display = "none";
        divDisclaimer.style.display = "none";

        document.body.removeChild(contentDiv);
        gl = null;
		return;
	}
	
	glu.init();
	//Shadows.init();
	
	//gl = WebGLDebugUtils.makeDebugContext(gl);
	
	gl.clearColor(0.5, 0.5, 0.5, 1.0);

	gl.clearDepth(1.0);
	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);

    onResize();

    mapSkyDome = new SkyDome();
    mapSkyDome.onLoaded = scheduleFrameRendering;

}


function onResize()
{

    /* Layouting algorithm:
     *   - if there is enough space (> 800x800px) or no tool window is shown -> display the tool window as a 400x400 overlay (smaller if the tool window requires less space), and let the GL canvas cover the whole screen
     *   - if there is not enough space and a tool window is shown:
     *      - if the screen is in landscape mode --> display the tool window as
     *        a side pane covering the left 400px (less if it needs less space) 
     *        of the screen at full height, and the GL canvas to cover the 
     *        remaining space
     *      - if the screen is in portrait mode --> display the tool window as
     *        a top pane covering the top 400px (less if it needs less space)
     *        of the screen at full width, and the GL canvas to cover the
     *        remaining space
     *
     * A tool window needs less than the alotted space, if:
     *  - for a div with html content: if its content fits into less than the
     *    alotted space (as determined by the browser's layout engine)
     *  - for the layout div: it will determine its space needs using its own
     *    algorithm base on the layout image aspect ratio
     *  - for the map div: it will always cover all of the available space
    */

    var wnd = myToolbar ? myToolbar.getActiveWindow() : undefined;
    var anyToolbarVisible = (wnd && wnd.target);
    var activeDiv = anyToolbarVisible;
    //dummy element so that the existence of activeDiv is guaranteed for the following code 
    if (!activeDiv)
        activeDiv = {style:{offsetTop:"72px;", offsetHeight:"0px"}};
        
    var mode = "overlay";

    if (mqSaveSpace.matches && anyToolbarVisible)
        mode = (mqLandscape.matches) ? "side" : "top";
        
    switch ( mode )
    {
        case "overlay":
            canvasContainer.style.left = "0px";
            canvasContainer.style.top = "0px";
            activeDiv.className = "toolWindow toolOverlay";
            activeDiv.style.maxHeight = ""

            if (activeDiv == mapDiv)
            {                
                mapDiv.className = "toolWindow toolOverlay leaflet-container leaflet-fade-anim";
                mapDiv.style.width =  (window.innerWidth /2) + "px";
                mapDiv.style.height = Math.min(600, window.innerHeight - 72) + "px";
            }
                
        break;
        case "side":
            canvasContainer.style.top  = "0px";
            activeDiv.style.maxHeight = ""
            
            activeDiv.className = "toolWindow toolSide";
            if (activeDiv == mapDiv)
            {
                mapDiv.className = "toolWindow toolSide leaflet-container leaflet-fade-anim";
                mapDiv.style.width = "400px";
                mapDiv.style.height = ""; 
            }

            canvasContainer.style.left = (activeDiv.offsetLeft + activeDiv.offsetWidth) + "px";
        break;
            
        case "top":
            canvasContainer.style.left = "0px";
            activeDiv.className = "toolWindow toolTop";
            activeDiv.style.height = ""
            activeDiv.style.width = "";
            activeDiv.style.maxHeight = "400px"
            
            if (activeDiv == mapDiv)
            {
                mapDiv.className = "toolWindow toolTop leaflet-container leaflet-fade-anim";
                mapDiv.style.width = "";
                mapDiv.style.height= "400px";
            }

            canvasContainer.style.top  = activeDiv.offsetTop + activeDiv.offsetHeight + "px";

        break;
    }
    
    divDisclaimer.style.left = canvasContainer.style.left;

    var aspect = webGlCanvas.clientWidth / webGlCanvas.clientHeight;

    /* Render the 3D view at half the device's native pixel count.
       This is a compromise between having a high resolution 3D view (even for
       devices with a high devicePixelRatio) and still being fast enough for smooth
       interaction. 
     */
    
    webGlCanvas.height = webGlCanvas.clientHeight * window.devicePixelRatio / Math.sqrt(2);
    webGlCanvas.width  = webGlCanvas.clientWidth  * window.devicePixelRatio / Math.sqrt(2);
   
    VicinityMap.onChangeSize();
    
    scheduleFrameRendering();
}	

var prevFrameEffectivePosition = {lat:0, lng:0, height:0};

function renderScene()
{
    if (!gl || !Controller.localPosition ) //not yet initialized
        return;

    //var sunPos = mapSun ? mapSun.getPosition() : (mapSkyDome ? [0,0,mapSkyDome.RADIUS] : [0,0,5000]);
    //Shadows.renderDepthTexture(sunPos, [0, 0, Controller.localPosition.z], [mapBuildings]);
    //select default frame buffer (do not render to texture);
    //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	gl.viewport(0, 0, webGlCanvas.width, webGlCanvas.height);

    var modelViewMatrix = glu.lookAt(Controller.viewAngleYaw, Controller.viewAnglePitch, Controller.localPosition);
    var projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, fieldOfView/180*Math.PI, webGlCanvas.width / webGlCanvas.height, 2, 5100.0);

    gl.enable(gl.CULL_FACE);

    var renderItems = [mapPlane, mapBuildings, mapSkyDome];
    for (var i in renderItems)
        if (renderItems[i])
            renderItems[i].render(modelViewMatrix, projectionMatrix);

    var effPos = Controller.getEffectivePosition();
    
    var hasMoved = ((effPos.lat != prevFrameEffectivePosition.lat) ||
                    (effPos.lng != prevFrameEffectivePosition.lng) ||
                    (effPos.height != prevFrameEffectivePosition.height));
                    
    //console.log("%s, %o, %o", hasMoved, effPos, prevFrameEffectivePosition);

    //update tile hierarchy in case something moved
    if (hasMoved)
        mapPlane.createTileHierarchy( getTileSet( tileSetSelection.value), Controller.getEffectivePosition());
    
    prevFrameEffectivePosition = effPos;
}

//document.addEventListener("load", init, false);
window.onload = init;

