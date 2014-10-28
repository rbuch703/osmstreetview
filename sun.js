"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

function getDayOfYear( date ) {
    var year = new Date(date.getFullYear(), 0, 0);
    var dt = date.valueOf() - year.valueOf();  //milliseconds since beginning of year
    return dt/ (1000 * 24 * 60 * 60);
}


/**
 * @constructor
 */
function Sun(lat, lng) {
    this.lat = lat;
    this.lng = lng;

    this.dayOfYear = 229;
    this.time = 12; //noon;

    this.buildGlGeometry();

}

Sun.prototype.setMomentInTime = function(day, time)
{
    if (day)
        this.dayOfYear = day;
    if (time)
        this.time = time;
        
    if (day || time)
        this.buildGlGeometry();
}

// source of computation: http://www.pveducation.org/pvcdrom/properties-of-sunlight/suns-position
Sun.getAngles = function(lat, lng, dayOfYear, timeOfDay)
{
    var dtGmt = 1; //usually one hour time difference to GMT

    // day-of-the-year at which summer time begins. Technically, European summer time starts on the last Sunday in March. But since we do not want the user to have to enter a year, we'll just use the end of March as an approximation
    var summerTimeBegins = 31+28+31;
    // day-of-the-yeat at which summer time ends. We use the last of October as an approximation
    var summerTimeEnds = 365 - 31 - 30 - 31;
    
    if (dayOfYear > summerTimeBegins && dayOfYear < summerTimeEnds)
        dtGmt = 2;

    var LSTM = 15 * dtGmt; //Local Standard Time Meridian
    var B = (dayOfYear - 81) / 365 * 2 * Math.PI;
    
    var EoT = 9.87 * Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B); //Equation of Time;
    //console.log("EoT: %s", EoT);    
    var TC = 4 * (lng - LSTM) + EoT; // Time Correction Factor
    
    var LST = timeOfDay + TC/60; //Local Solar Time
    
    var HRA = (15 * (LST - 12)) / 180 * Math.PI;  // Hour Angle in radiants
    var delta = (23.45 * Math.sin(B)) / 180 * Math.PI; // declination in radiants
    //console.log("Declination: %s", delta/Math.PI*180);
    
    var phi = lat / 180 * Math.PI;           // latitude in radiants
    
    var elevation = Math.asin( Math.sin(delta) * Math.sin(phi) + 
                               Math.cos(delta) * Math.cos(phi) * Math.cos(HRA));
                              
    var azimuth = Math.acos( (Math.sin(delta) * Math.cos(phi) - 
                              Math.cos(delta) * Math.sin(phi) * Math.cos(HRA)) /
                              Math.cos(elevation));
    
    if (HRA > 0) azimuth = 2 * Math.PI - azimuth;
    return {"elevation": elevation, "azimuth": azimuth};
}

Sun.prototype.getAngles = function() {
    return Sun.getAngles( this.lat, this.lng, this.dayOfYear, this.time );
}

Sun.getPosition = function(azimuth, elevation, radius) {

    if (radius === undefined)
        radius = SkyDome.RADIUS;

    //var RADIUS = 00;  //Skybox radius (on which the sun is pinned)
    return [ radius * Math.sin(azimuth) * Math.cos(elevation), 
            -radius * Math.cos(azimuth) * Math.cos(elevation), 
             radius * Math.sin(elevation)];

}

Sun.getSunriseTime = function(lat, lng, dayOfYear)
{
    var hi = 12.0; //noon;
    var lo = 0.0;  //midnight;
    
    // check for polar day/night (sun is always above/below the horizon) where sunrise/sunset have no meaning.
    // Note that the computation here is not mathematically correct (noon and midnight need not be the points of highest/lowest 
    // elevation, and thus sun may rise/set even though it has not risen till noon/set till midnight),
    // but it works for the latitude range we are interested in.
    if (Sun.getAngles(lat, lng, dayOfYear, hi).elevation < 0 || Sun.getAngles(lat, lng, dayOfYear, lo).elevation > 0)
            return null; 
        
    for (var i = 0; i < 10; i++)
    {
        var mid = (hi +lo) / 2.0;
        if ( Sun.getAngles(lat, lng, dayOfYear, mid).elevation < 0)
            lo = mid;
        else
            hi = mid;
    }
    return (hi + lo) / 2.0;

}

Sun.prototype.getSunriseTime = function()
{
    return Sun.getSunriseTime(this.lat, this.lng, this.dayOfYear);
}


Sun.getSunsetTime = function(lat, lng, dayOfYear)
{
    var lo = 12.0; //noon;
    var hi = 24.0;  //midnight;
    // check for polar day/night (sun is always above/below the horizon) where sunrise/sunset have no meaning.
    // Note that the computation here is not mathematically correct (noon and midnight need not be the points of highest/lowest 
    // elevation, and thus sun may rise/set even though it has not risen till noon/set till midnight),
    // but it works for the latitude range we are interested in.
    if (Sun.getAngles(lat, lng, dayOfYear, hi).elevation > 0 || Sun.getAngles(lat, lng, dayOfYear, lo).elevation < 0)
        return null;
        
    for (var i = 0; i < 10; i++)
    {
        var mid = (hi +lo) / 2.0;
        if ( Sun.getAngles(lat, lng, dayOfYear, mid).elevation < 0)
            hi = mid;
        else
            lo = mid;
    }
    return (hi + lo) / 2.0;

}


Sun.prototype.getSunsetTime = function()
{
    return Sun.getSunsetTime(this.lat, this.lng, this.dayOfYear);
}

Sun.prototype.getPosition = function() {
    var angles = this.getAngles();
    return Sun.getPosition(angles.azimuth, angles.elevation, SkyDome.RADIUS - 100);
}


Sun.prototype.buildOrbitGlGeometry = function() {
    if (this.orbitVertices)
        gl.deleteBuffer(this.orbitVertices);

    var vertices = [];

    for (var t = 0; t <= 24; t+=0.1)
    {
        var angles = Sun.getAngles(this.lat, this.lng, this.dayOfYear, t);
        var pos = Sun.getPosition( angles.azimuth, angles.elevation, SkyDome.RADIUS - 100);
        [].push.apply(vertices, pos);
    }

    this.numOrbitVertices = vertices.length / 3 | 0;
    //console.log(vertices);
    this.orbitVertices = glu.createArrayBuffer(vertices);

}

Sun.prototype.buildGlGeometry = function() {
    if (this.vertices)
        gl.deleteBuffer(this.vertices);

    var shift = this.getPosition();
    //console.log(shift);
    var vertices= [];
 	
	var base = [];
	var top = [];
		
	var NUM_H_SLICES = 10;
	var NUM_V_SLICES = 10;
	for (var i = 0; i < NUM_H_SLICES; i++)
	{
		var azimuth1 = i / NUM_H_SLICES * 2 * Math.PI;    //convert to radiants in  [0...2*PI]
		var x1 = Math.cos(azimuth1) * Sun.RADIUS;
		var y1 = Math.sin(azimuth1) * Sun.RADIUS;

		var azimuth2 = (i+1) / NUM_H_SLICES * 2 * Math.PI;
		var x2 = Math.cos(azimuth2) * Sun.RADIUS;
		var y2 = Math.sin(azimuth2) * Sun.RADIUS;


	    for (var j = 0; j+1 <= NUM_V_SLICES; j++)
    	{
    	    var polar1 =  j    * Math.PI / (2.0 * NUM_V_SLICES); //convert to radiants in [0..1/2*PI]
    	    var polar2 = (j+1) * Math.PI / (2.0 * NUM_V_SLICES);

            
		    var A = [x1 * Math.cos(polar1), y1 * Math.cos(polar1), Sun.RADIUS * Math.sin(polar1)];
		    var B = [x2 * Math.cos(polar1), y2 * Math.cos(polar1), Sun.RADIUS * Math.sin(polar1)];
		    var C = [x2 * Math.cos(polar2), y2 * Math.cos(polar2), Sun.RADIUS * Math.sin(polar2)];
		    var D = [x1 * Math.cos(polar2), y1 * Math.cos(polar2), Sun.RADIUS * Math.sin(polar2)];

		
		    var verts = [].concat(A, C, B, A, D, C);
		    vertices.push.apply( vertices, verts);
		    
		    A[2] = -A[2];
		    B[2] = -B[2];
		    C[2] = -C[2];
		    D[2] = -D[2];
		    verts = [].concat(A, B, C, A, C, D);
		    //var verts = [].concat(A, C, B, A, D, C);
		    vertices.push.apply( vertices, verts);
		    
		}
	}

	for (var i = 0; i < vertices.length; i+=3)
	{
	    vertices[i  ] += shift[0];
	    vertices[i+1] += shift[1];
	    vertices[i+2] += shift[2];
	}
	
	this.numVertices = vertices.length / 3;
    this.vertices = glu.createArrayBuffer(vertices);
    //this.texCoords= glu.createArrayBuffer(this.texCoords);
    this.buildOrbitGlGeometry();
}

Sun.prototype.render = function(modelViewMatrix, projectionMatrix) {

    if (! Shaders.ready)
        return;
        
	gl.useProgram( Shaders.flat );   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(Shaders.flat.locations.vertexPosition); // setup vertex coordinate buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.flat.locations.vertexPosition, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(Shaders.flat.locations.modelViewProjectionMatrix, false, mvpMatrix);
	gl.uniform4fv( Shaders.flat.locations.color, [1.0, 1.0, 0.90, 1.0]);
    
	gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);
	
    //render orbit	
    gl.useProgram(Shaders.flat);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(Shaders.flat.locations.vertexPosition); // setup vertex coordinate buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.orbitVertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.flat.locations.vertexPosition, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
	gl.uniformMatrix4fv(Shaders.flat.locations.modelViewProjectionMatrix, false, mvpMatrix);
	gl.uniform4fv( Shaders.flat.locations.color, [0.6, 0.2, 0.2, 1.0]);
    gl.drawArrays(gl.LINES, 0, this.numOrbitVertices);
	
}

Sun.RADIUS = 100;
