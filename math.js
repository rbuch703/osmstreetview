"use strict"

function long2tile(lon,zoom) { return ((lon+180)/360*Math.pow(2,zoom)); }
function lat2tile(lat,zoom)  { return ((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)); }

function tile2long(x,z) { return (x/Math.pow(2,z)*360-180); }
function tile2lat(y,z) { 
    var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
    return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}


function dist3(a, b)
{
    var dx = a[0]-b[0];
    
    return Math.sqrt(   Math.pow(a[0]-b[0], 2)+
                        Math.pow(a[1]-b[1], 2)+ 
                        Math.pow(a[2]-b[2], 2) );
}

function len3(a) { return Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]); }

function openingAngle( v1, v2, v3) {
    
    var a = dist3(v2, v3);
    var b = dist3(v1, v2);
    var c = dist3(v1, v3);
    
    var cosAlpha = - ( a*a - b*b - c*c)/ ( 2*b*c);
    return Math.acos(cosAlpha) / Math.PI * 180;
}


function sub2(a, b) { return [a[0] - b[0], a[1]-b[1]]; }
function norm2(a) { var len = Math.sqrt(a[0]*a[0] + a[1]*a[1]); return [a[0]/len, a[1]/len];}
function dot2(a,b) { return a[0]*b[0] + a[1]*b[1];}

function norm3(v)
{
    var len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return [ v[0]/len, v[1]/len, v[2]/len];
}

