"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

var VicinityMap = {
    
    init: function(div, lat, lng)
    {
        //console.log(lat, lng);
        VicinityMap.map = L.map(div, {keyboard:false} );
        VicinityMap.map.on("click", VicinityMap.onMapClick);
        VicinityMap.map.on("touchstart", VicinityMap.onMapClick);
        VicinityMap.map.on("zoomend", VicinityMap.renderFrustum);

        L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'OpenStreetMap',
            maxZoom: 19, minZoom:0,
        }).addTo(VicinityMap.map);

        L.control.scale({imperial:false, position:"topright"}).addTo(VicinityMap.map);
    },
    
    resetView: function( latlng)
    {
        VicinityMap.map.setView(latlng, 17);
    },

    updatePositionMarker: function(newPos)
    {
        if (!VicinityMap.map)  //not yet initialized
            return;
            
        if (VicinityMap.positionMarker)
            VicinityMap.map.removeLayer(VicinityMap.positionMarker);
        
        VicinityMap.positionMarker = L.marker( newPos );
        VicinityMap.positionMarker.addTo(VicinityMap.map);//.bindPopup("You are here");
    },

    
	renderFrustum: function()
	{
        if (!VicinityMap.map)  //not yet initialized
            return;


	    if (VicinityMap.frustum)
	    {
	        VicinityMap.map.removeLayer(VicinityMap.frustum);
	        VicinityMap.frustum = null;
        }
	    
	    var effectivePosition = Controller.getEffectivePosition();
	    
	    /* One degree latitude on earth always corresponds to the same distance in meters ( 1/360th of the earth circumference).
	     * But the distance of one degree longitude changes depending of the current latitude.
	     * This aspect is the ration between the two distances. It is needed to correctly
	     * draw that viewing frustum, which needs to be specified in lat/lnt
	    */
	    var localAspect = Math.cos( effectivePosition.lat / 180 * Math.PI);
	    
        var yawRad = Controller.viewAngleYaw / 180 * Math.PI;
        /* compute only planar lookDir (ignoring pitch), as this is the relevant direction to render the frustum
           on a 2D map
         */
        var lookDir = [Math.sin( yawRad), Math.cos(yawRad)];
	    
	    //console.log ("local aspect ratio at %s is %s", position.lat, localAspect );
	    
	    //console.log( webGlCanvas.height, webGlCanvas.width, fieldOfView / webGlCanvas.height * webGlCanvas.width);
	    var phi = (0.5 * fieldOfView / webGlCanvas.height * webGlCanvas.width ) / 180 * Math.PI;
	    var leftDir = [ Math.cos(phi) * lookDir[0]  - Math.sin(phi) * lookDir[1], 
	                    Math.sin(phi) * lookDir[0]  + Math.cos(phi) * lookDir[1] ];
	    var rightDir =[ Math.cos(-phi) * lookDir[0] - Math.sin(-phi) * lookDir[1], 
	                    Math.sin(-phi) * lookDir[0] + Math.cos(-phi) * lookDir[1] ];

        var len = Math.pow(0.5, VicinityMap.map.getZoom())*2000;
        //console.log(map.getZoom(), len);
	    var pA = { lat: effectivePosition.lat + leftDir[1]*len*localAspect,  lng: effectivePosition.lng + leftDir[0]*len };
	    var pB = { lat: effectivePosition.lat + rightDir[1]*len*localAspect, lng: effectivePosition.lng + rightDir[0]*len};
	    var line = [effectivePosition, pA, pB, effectivePosition ]
	    VicinityMap.frustum = L.polygon(line, {color: 'red', noClip: 'true', fillColor:"white", fillOpacity:0.4}).addTo(VicinityMap.map);
	},

    onMapClick: function(e)
    {
        resetPosition(e.latlng);
    }   


}
