//
// geometry-3d.js
//
// Author: Jim Fix
// MATH 385, Reed College, Fall 2024
//
// This defines two classes:
//
//    Point3d:  a class of locations in 3-space
//    Vector3d: a class of offsets between points within 3-space
//
// The two classes are designed based on Chapter 3 of "Coordinate-Free
// Geometric Programming" (UW-CSE TR-89-09-16) by Tony DeRose.
//

const EPSILON3D = 0.00000001;
const glVertex3f = (_x: number, _y: number, _z: number) => {}
const glNormal3f = (_x: number, _y: number, _z: number) => {}

// class Point3d
//
// Description of 3-D point objects and their methods.
//
class Point3d {
    x: number;
    y: number;
    z: number;

    constructor(_x: number, _y: number, _z: number) {
        /*
         * Construct a new point instance from its coordinates.
         */
        this.x = _x;
        this.y = _y;
        this.z = _z;
    }

    components() {
        /*
         * Return the components as an array.
         */
        return [this.x, this.y, this.z];
    }

    glVertex3fv() {
        /*
         * Issues a glVertex3f call with the coordinates of this.
         */
        glVertex3f(this.x,this.y,this.z);
    }

    plus(offset: Vector3d): Point3d {
        /*
         * Computes a point-vector sum, yielding a new point.
         */
        return new Point3d(this.x+offset.dx,
                           this.y+offset.dy,
                           this.z+offset.dz);
    }

    minus(other: Point3d): Vector3d;
    minus(other: Vector3d): Point3d;
    minus(other: Point3d | Vector3d): Point3d | Vector3d {
        /*
         * Computes point-point subtraction, yielding a vector.
         *   or else
         * Computes point-vector subtraction, yielding a point. 
         */
        if (other instanceof Point3d) {
            return new Vector3d(this.x-other.x,
                                this.y-other.y,
                                this.z-other.z);
        } else if (other instanceof Vector3d) {
            return new Point3d(this.x-other.dx,
                               this.y-other.dy,
                               this.z-other.dz);
        } else {
            return this;
        }
    }

    dist2(other: Point3d): number {
        /*
         * Computes the squared distance between this and other.
         */
        return this.minus(other).norm2();
    }

    dist(other: Point3d): number {
        /*
         * Computes the distance between this and other.
         */
        return this.minus(other).norm();
    }

    combo(scalar: number, other: Point3d): Point3d {
        /*
         * Computes the affine combination of this with other
         * according to
         *
         *       (1-scalar)*this + scalar*other
         */
        return this.plus(other.minus(this).times(scalar));
    }

    combos(scalars: number[], others: Point3d[]): Point3d {
        /*
         * Computes the affine combination of this with other.
         */
        let P: Point3d = this;
        const n = Math.min(scalars.length,others.length);
        for (let i = 0; i < n; i++) {
            P = P.plus(others[i].minus(this).times(scalars[i]));
        }
        return P;
    }

    max(other: Point3d): Point3d {
        /*
         * Componentwise maximum of two points' coordinates.
         */
        return new Point3d(Math.max(this.x,other.x),
                           Math.max(this.y,other.y),
                           Math.max(this.z,other.z));
    }

    min(other: Point3d): Point3d {
        /*
         * Componentwise minimum of two points' coordinates.
         */
        return new Point3d(Math.min(this.x,other.x),
                           Math.min(this.y,other.y),
                           Math.min(this.z,other.z));
    }
}

Point3d.prototype.withComponents = function(cs) {
    /*
     * Construct a point from an array.
     */ 
    return new Point3d(cs[0], cs[1], cs[2]);
}    

// class Vector3d
//
// Description of 3-D vector objects and their methods.
//
class Vector3d {
    dx: number;
    dy: number;
    dz: number;

    constructor(_dx: number, _dy: number, _dz: number) {
        /*
         * Construct a new vector instance.
         */
        this.dx = _dx;
        this.dy = _dy;
        this.dz = _dz;
    }

    glNormal3fv() {
        /*
         * Issues a glVertex3f call with the coordinates of this.
         */
        glNormal3f(this.dx,this.dy,this.dz);
    }
    
    components() {
        /*
         * This vector's components as a list.
         */
        return [this.dx,this.dy,this.dz];
    }

    plus(other: Vector3d): Vector3d {
        /*
         * Sum of this and other.
         */
        return new Vector3d(this.dx + other.dx,
                            this.dy + other.dy,
                            this.dz + other.dz);
    }

    minus(other: Vector3d): Vector3d {
        /*
         * Vector that results from subtracting other from this.
         */
        return this.plus(other.neg());
    }

    times(scalar: number): Vector3d {
        /*
         * Same vector as this, but scaled by the given value.
         */
        return new Vector3d(scalar * this.dx,
                            scalar * this.dy,
                            scalar * this.dz);
    }

    neg(): Vector3d {
        /*
         * Additive inverse of this.
         */
        return this.times(-1.0);
    }

    dot(other: Vector3d): number {
        /*
         * Dot product of this with other.
         */
        return this.dx*other.dx + this.dy*other.dy + this.dz*other.dz;
    }

    cross(other: Vector3d): Vector3d {
        /*
         * Cross product of this with other.
         */
        return new Vector3d(this.dy*other.dz-this.dz*other.dy,
                            this.dz*other.dx-this.dx*other.dz,
                            this.dx*other.dy-this.dy*other.dx);
    }

    norm2(): number {
        /*
         * Length of this, squared.
         */
        return this.dot(this);
    }

    norm(): number {
        /*
         * Length of this.
         */
        return Math.sqrt(this.norm2());
    }

    unit(): Vector3d {
        /*
         * Unit vector in the same direction as this.
         */
        const n = this.norm();
        if (n < EPSILON3D) {
            return new Vector3d(1.0, 0.0, 0.0);
        } else {
            return this.times(1.0/n);
        }
    }

    div(scalar: number): Vector3d {
        /*
         * Defines v / a as v * 1/a
         */
        return this.times(1.0/scalar);
    }
}

Vector3d.prototype.withComponents = function(cs) {
    /* 
     * Construct a vector from an array.
     */
    return new Vector3d(cs[0],cs[1],cs[2]);
}

Vector3d.prototype.randomUnit = function() {
    /* 
     * Construct a random unit vector 
     */
    
    //
    // This method is adapted from 
    //    http://mathworld.wolfram.com/SpherePointPicking.html
    //
    const phi = Math.random() * Math.PI * 2.0;
    const theta = Math.acos(2.0 * Math.random() - 1.0);
    return new Vector3d(Math.sin(theta) * Math.cos(phi),
                        Math.sin(theta) * Math.sin(phi),
                        Math.cos(theta));
}



function ORIGIN3D()   { return new Point3d(0.0,0.0,0.0); }
function X_VECTOR3D() { return new Vector3d(1.0,0.0,0.0); }
function Y_VECTOR3D() { return new Vector3d(0.0,1.0,0.0); }
function Z_VECTOR3D() { return new Vector3d(0.0,0.0,1.0); }

export {Point3d, Vector3d, ORIGIN3D, X_VECTOR3D, Y_VECTOR3D, Z_VECTOR3D}
