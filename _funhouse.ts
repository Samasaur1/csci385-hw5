//
// funhouse.js
//
// Author: Jim Fix
// CSCI 385: Computer Graphics, Reed College, Fall 2024
//
// This defines the supporting objects for the ray traced scene
// editor.
//
// It defines these two classes
//
//  * Sphere: the placement and sizing of a sphere in the scene.
//
//  * Curve: a (Bezier) curve as specified by some control points.
//
// Both can be rendered in a WebGL/opengl context.
//
// ------
//

import { Point3d } from "./_geometry-3d";

type Color = { r: number, g: number, b: number }
declare function glPushMatrix(): void
declare function glPopMatrix(): void
declare function glTranslatef(tx: number, ty: number, tz: number): void
declare function glRotatef(angle: number, axis_x: number, axis_y: number, axis_z: number): void
declare function glScalef(sx: number, sy: number, sz: number): void
declare function glColor3f(r: number, g: number, b: number): void
declare function glBeginEnd(name: string): void
declare function glEnable(mode: number): void
declare function glDisable(mode: number): void
declare var GL_LIGHTING: number
declare var GL_LIGHT0: number
declare var gPOINT_COLOR: Color
declare var gCURVE_COLOR: Color

const MINIMUM_PLACEMENT_SCALE = 0.1; // Smallest sphere we can place.
const MAX_SELECT_DISTANCE = 0.2;     // Distance to select a control point.
const SMOOTHNESS = 500.0;            // How smooth is our curve approx?
const EPSILON = 0.00000001;

class Sphere {
    color: Color;
    position: Point3d;
    radius: number;

    //
    // Class representing the placement a sphere in the scene.
    //
    constructor(color: Color, position0: Point3d) {
        //
        // `position`, `radius`: a `point` and number,
        //  representing the location and size of a
        //  sphere placed in the scene.
        //
        this.color       = color;
        this.position    = position0;
        this.radius      = MINIMUM_PLACEMENT_SCALE;
    }
    
    resize(scale: number, bounds) {
        //
        // Resize the sphere.  Some checks prevent growing it beyond
        // the scene bounds.
        //
        scale = Math.max(scale, MINIMUM_PLACEMENT_SCALE);
        scale = Math.min(scale, bounds.right - this.position.x);
        scale = Math.min(scale, bounds.top - this.position.y);
        scale = Math.min(scale, this.position.x - bounds.left);
        scale = Math.min(scale, this.position.y - bounds.bottom) ;
        this.radius = scale;    
    }

    moveTo(position, bounds) {
        //
        // Relocate the sphere.  Some checks prevent the object from
        // being placed outside the scene bounds.
        //
        position.x = Math.max(position.x ,bounds.left + this.radius);
        position.y = Math.max(position.y, bounds.bottom + this.radius);
        position.x = Math.min(position.x, bounds.right - this.radius);
        position.y = Math.min(position.y, bounds.top - this.radius);
        this.position = position;
    }

    includes(queryPoint: Point3d): boolean {
        //
        // Checks whether the `queryPoint` lives within its footprint.
        //
        const distance = this.position.dist2(queryPoint);
        return (distance < this.radius*this.radius);
    }

    draw(highlightColor, drawBase, drawShaded: boolean) {
        //
        // Draws the sphere within the current WebGL/opengl context.
        //
        glPushMatrix();
        glTranslatef(this.position.x, this.position.y, this.position.z);
        glScalef(this.radius, this.radius, this.radius);
        //
        // draw
        if (drawShaded) {
            // Turn on lighting.
            glEnable(GL_LIGHTING);
            glEnable(GL_LIGHT0);
        }
        glColor3f(this.color.r, this.color.g, this.color.b);
        glBeginEnd("sphere");
        if (drawShaded) {
            // Turn on lighting.
            glDisable(GL_LIGHT0);
            glDisable(GL_LIGHTING);
        }

        // draw with highlights
        if (highlightColor != null) {
            
            glColor3f(highlightColor.r,
                      highlightColor.g,
                      highlightColor.b);
            //
            // Draw its wireframe.
            glBeginEnd("sphere-wireframe");
        }

        glPopMatrix();
    }    
}


class Curve {
    controlPoints: Point3d[];
    points: Point3d[];
    compiled: boolean;

    //
    // Class representing a controllable Bezier quadratic curve in a
    // scene.
    //
    // The control points array passed to the constructor can be
    // edited externally by a client. The client is required to call
    // the `update` method when any control point has been
    // edited. This will trigger a "recompiling" of the points of the
    // polyline used to render the Bezier curve. 
    //
    constructor(controlPoints: Point3d[]) {
        this.controlPoints = controlPoints; // Should be an array of 3 Point3d objects.
        //
        this.points        = [];    // The samples for the approximation of the curve.
        this.compiled      = false; // Has `this.points` been computed?
    }

    compile() {
        //
        // Recompiles the polyline that is a smooth sampling of the
        // points on the Bezier curve. These curve points only need
        // to be recompiled if the curve was just created, or if the
        // control points have been moved.
        //
        // The result of this call is a computing of a list of
        // sample points, recorded in `this.points`.
        //

        if (!this.compiled) {
            //
            // COMPLETE THIS CODE!
            //

            // Currently just returns the three control points, rather
            // than sampling points on the entire curve.
            //
            this.points = [this.controlPoints[0],
                           this.controlPoints[1],
                           this.controlPoints[2]];
            this.compiled = true;
        }
    }

    update() {
        //
        // Invalidate `this.points` so that it gets recompiled
        // when the curve points need to be used (to draw, e.g.).
        //
        this.compiled = false;
    }

    chooseControlPoint(queryPoint: Point3d): number {
        //
        // Returns the integer index (0, 1, or 2) of the closest
        // control point to the given `queryPoint`, or -1 if none
        // are close enough.
        //
        let which = -1;
        let distance2 = MAX_SELECT_DISTANCE * MAX_SELECT_DISTANCE;
        for (let i=0; i <= 2; i++) {
            const d2 = queryPoint.minus(this.controlPoints[i]).norm2();
            if (d2 < distance2) {
                which = i;
                distance2 = d2;
            }
        }
        return which;
    }
    
    drawControls() {
        //
        // Renders the three control points of a quadratic
        // Bezier curve.
        //
        for (let i=0; i <= 2; i++) {
            glPushMatrix();
            glTranslatef(this.controlPoints[i].x,
                         this.controlPoints[i].y,
                         1.9);
            glScalef(0.02,0.02,0.02);
            const gc = gPOINT_COLOR;
            glColor3f(gc.r, gc.g, gc.b);
            glBeginEnd("square");
            glPopMatrix();
        }
    }

    drawCurve() {
        //
        // Renders the polyline specified as the array of points
        // `this.points`. These should give a smooth approximation
        // of the quadratic Bezier, and so as a result this code
        // draws the curve.
        //
        const cc = gCURVE_COLOR;
        for (let index = 1; index < this.points.length; index++) {
            //
            // Compute some info about this segment of the polyline.
            const p0 = this.points[index-1];
            const p1 = this.points[index];
            const dir = p1.minus(p0).unit();
            const len = p0.dist(p1);
            const ang = Math.atan2(dir.dy, dir.dx) * 180.0 / Math.PI;
            
            glPushMatrix();
            //
            // Perform the transformations to render this segment.
            glTranslatef(p0.x, p0.y, 1.5);
            glRotatef(ang, 0.0, 0.0, 1.0);
            glRotatef(90,0.0,1.0,0.0);
            glScalef(0.01, 0.01, len);
            //
            // Render this segment of the curve.
            glColor3f(cc.r, cc.g, cc.b);
            glBeginEnd("path")
            //
            glPopMatrix();
        }
    }        
    
    draw() {
        // Renders the curve control points and the actual
        // curve.
        //
        // If the control points have moved since the last
        // time the curve was drawn, then this recompiles
        // the curve from the control point info.
        //
        this.compile();      // Recomputes this.points.
        this.drawCurve();    // Uses this.points.
        //
        this.drawControls();
    }   
}
