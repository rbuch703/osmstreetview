"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

//var map;
var mapPlane;
var mapBuildings;
var mapSkyDome;
var mapSun;

var gl;
var fieldOfView = 90/16*9;

var mqSaveSpace = window.matchMedia( "(max-height: 799px), (orientation: portrait)" );

//pasted from controller.js; FIXME: find better common place
function toDictionary (queryString)
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
}

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

    Controller.onRequestFrameRender = scheduleFrameRendering;
    
    
}

function resetPosition(pos )
{
    if (!gl)
        return;

    Controller.position = pos;
    VicinityMap.resetView(pos);
    Controller.updateHistoryState();
    if (glu.performShadowMapping)
        mapSun = new Sun( Controller.position.lat, Controller.position.lng );
        
    //initialize mapSun date/time
    onSunPositionChanged( $( "#slider-day" ).slider( "value"), $( "#slider-time" ).slider( "value"));

    mapBuildings = new Buildings(gl, Controller.position);
    mapBuildings.onLoaded = scheduleFrameRendering;

    Controller.localPosition.x = 0;
    Controller.localPosition.y = 0;

    mapPlane = new MapLayer();
    mapPlane.onProgress= scheduleFrameRendering;


    initEventHandler();
    
    scheduleFrameRendering();

}    


var daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getDayString(dayOfYear)
{
    var day = ((dayOfYear % 366) | 0)+1;
    var monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    
    for (var month = 0; day > daysPerMonth[month]; month++)
        day -= daysPerMonth[month];
        
    return monthNames[month] + ", " + day;
}

function getDayOfYear(date)
{
    var month = date.getMonth();        //Note the JavaScript Date API is 0-based for the getMonth(),
    var dayOfYear = date.getDate()-1;   //but 1-based for getDate()
    
    for (var i = 0; i < month; i++)
        dayOfYear += daysPerMonth[i];

    //for now, we just ignore leap years altogether        
    //var year = date.getFullYear();
    //var isLeapYear =  (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
    
    //in a leap year, every day after February 28th is one day further from the beginning of that year than normal
    //if (isLeapYear && dayOfYear > daysPerMonth[0] + daysPerMonth[1])
    //    dayOfYear += 1;
        
    return dayOfYear;
}

function onSunPositionChanged(day, time)
{
    if (!mapSun)
        return;
        
    mapSun.setMomentInTime(day, time);
    
    var riseTime = mapSun.getSunriseTime();
    if (riseTime == null) riseTime = 0.0;
    
    var setTime = mapSun.getSunsetTime();
    if (setTime == null) setTime = 24.0;
    
    $( "#slider-time" ).slider("option", "min", riseTime);
    $( "#slider-time" ).slider("option", "max", setTime);
    
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
}
    
function onNewEyeHeight(newHeight)
{
    //console.log("new eye height is %s", newHeight);
    Controller.localPosition.z = newHeight;
    Controller.updateHistoryState();
    scheduleFrameRendering();
}
    
function init()
{
    var idx = document.URL.indexOf("?");

    Controller.position = {"lat": 52.13940000, "lng": 11.63960000};

    if (idx)
        Controller.initFromQueryString(document.URL.substring(idx + 1));
    
    initGl();  //initialize webGL canvas
    if (!gl)
        return;
   
    Shaders.init(errorLog);

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
        });

    //console.log("Local height is %s", Controller.localPosition.z);
    jQuery( "#slider-height" ).slider({
        min: 10,
        max: 200,
        value: Math.sqrt(Controller.localPosition.z*100),
        step:0.5,
        stop:  function( event, ui ) { onNewEyeHeight((ui.value*ui.value)/100); },
        slide: function( event, ui ) { onNewEyeHeight((ui.value*ui.value)/100); }
        });


    //disallow slider manipulation via keyboard, as keyboard input is alredy used for movement inside the scene
    jQuery("#slider-height .ui-slider-handle").unbind('keydown');    
    jQuery("#slider-day .ui-slider-handle").unbind('keydown');    
    jQuery("#slider-time .ui-slider-handle").unbind('keydown');    
    
    VicinityMap.init("mapDiv", Controller.position.lat, Controller.position.lng);
    resetPosition(Controller.position)

    mqSaveSpace.addListener(onLayoutChange);
    onLayoutChange();
}   

function onLayoutChange()
{
    if (mqSaveSpace.matches)
    {
    } else
    {
    }
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
    /*Note: 
     *   - Canvas.style.height sets the size of the object on screen, but is a CSS property (may also be something like "100%")
     *   - Canvas.clientHeight is the read-only value of the consequence of Canvas.style.height 
     *     in pixels (even if style.height is given in percent, etc.)
     *   - Canvas.height sets the logical size of the drawing buffer is pixels (its content is later scaled to fit the object on screen)
     */	    
    if (window.matchMedia( "(orientation: landscape)" ).matches )
        webGlCanvas.style.height = webGlCanvas.clientWidth / 16 * 9 + "px";
    else 
        webGlCanvas.style.height = "100%";
    webGlCanvas.height = webGlCanvas.clientHeight;// / 2;
    webGlCanvas.width  = webGlCanvas.clientWidth;// / 2;


    scheduleFrameRendering();
}	


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

    var renderItems = [mapPlane, mapBuildings, mapSkyDome, mapSun];
    for (var i in renderItems)
        if (renderItems[i])
            renderItems[i].render(modelViewMatrix, projectionMatrix);

}

//document.addEventListener("load", init, false);
window.onload = init;

