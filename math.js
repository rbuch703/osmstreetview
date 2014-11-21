"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

function long2tile(lon,zoom) { return ((lon+180)/360*Math.pow(2,zoom)); }
function lat2tile(lat,zoom)  { return ((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)); }

function tile2long(x,z) { return (x/Math.pow(2,z)*360-180); }
function tile2lat(y,z) { 
    var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
    return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}


function dist3(a, b)
{
    return Math.sqrt(   Math.pow(a[0]-b[0], 2)+
                        Math.pow(a[1]-b[1], 2)+ 
                        Math.pow(a[2]-b[2], 2) );
}

function len3(a) { return Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]); }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2] ]; }
function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2] ]; }
function mul3scalar(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
function neg3(a) { return [-a[0], -a[1], -a[2]]; }



function sub2(a, b) { return [a[0] - b[0], a[1] - b[1] ]; }
function add2(a, b) { return [a[0] + b[0], a[1] + b[1] ]; }
function len2(a)    { return Math.sqrt(a[0]*a[0] + a[1]*a[1]); }
function dist2(a, b){ return len2 (sub(a, b)); }
function norm2(a) { var len = Math.sqrt(a[0]*a[0] + a[1]*a[1]); return [a[0]/len, a[1]/len];}
function dot2(a,b) { return a[0]*b[0] + a[1]*b[1];}

function rotate(vector, angle)
{
    angle = angle /180 * Math.PI;

    var v0    = Math.cos( angle ) * vector[0] - Math.sin( angle ) * vector[1] ;
    vector[1] = Math.sin( angle ) * vector[0] + Math.cos( angle ) * vector[1] ;
    
    vector[0] = v0;
}


function norm3(v)
{
    var len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return [ v[0]/len, v[1]/len, v[2]/len];
}

function getNormal(p1, p2, p3)
{
    var v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    var v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
//    console.log(v1, v2);
    return norm3( [ v1[2]*v2[1] - v1[1]*v2[2], v1[0]*v2[2] - v1[2]*v2[0], v1[1]*v2[0] - v1[0]*v2[1]] );
}

//returns the angle (in degrees) between the vectors v1-v2 and v1-v3
function openingAngle( v1, v2, v3) {
    
    var a = dist3(v2, v3);
    var b = dist3(v1, v2);
    var c = dist3(v1, v3);
    
    var cosAlpha = - ( a*a - b*b - c*c)/ ( 2*b*c);
    cosAlpha = Math.min(1, Math.max( -1, cosAlpha)); //clamp to [-1..1] to reduce the effect of numerical inaccuracy
    
    return Math.acos(cosAlpha) / Math.PI * 180;
}


/* returns the shortest distance of the axis-aligned rectangle given by x1-x2 
    and y1-y2 to the origin (0,0). This may be zero if the origin is inside or
    on the edge of the rectangle */
function getMinDistanceFromOrigin(x1, x2, y1, y2) 
{
    var v1 = [ x1, y1, 0 ];
    var v2 = [ x2, y1, 0 ];
    var v3 = [ x2, y2, 0 ];
    var v4 = [ x1, y2, 0 ];

    var minDistance = Math.min( len3(v1), len3(v2), len3(v3), len3(v4));
    if (x1 * x2 < 0) //if x1 and x2 differ in sign, the closest point is not a vertex, but lies on an edge
        minDistance = Math.min(minDistance, Math.abs(y1), Math.abs(y2));
    
    if (y1 * y2 < 0)
        minDistance = Math.min(minDistance, Math.abs(x1), Math.abs(x2));
    
    // x1/x2 and y1/y2 differ in sign --> origin is contained in quad
    if (x1*x2 < 0 && y1*y2 < 0) 
        minDistance = 0;

    return minDistance;
}


