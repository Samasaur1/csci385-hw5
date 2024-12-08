//
// trace-fs.c
//
// Reed College CSCI 385 Computer Graphics Spring 2024
//
// This is a fragment shader that colors a pixel according to
// the result of tracing a ray into a simple 3D scene. The scene 
// consists of cubical room with matte-shaded walls, and several
// glossy spheres. There is also one mirrored object (a sphere or
// a Bezier curved sheet) that reflects the scene to the viewer.
// There is one light source that illuminates the scene.
//
// The code is sent the light's color and position, along with
// the ray tracing projection information from the front end.
// The key component of that projection info is a `ray_offset`
// a `vec2` that describes where each ray should be traced through
// the virtual screen.
//
// This offset is sent from the vertex shader, giving an
// (x,y) location chosen uniformly from [-1,1]^2, one value
// pair for each pixel rendered by WebGL.
//
// The code is best further described under `main` and `trace`,
// and these rely on several functions that compute intersections
// of a ray with walls, spheres, and the Bezier curved mirror.
//
// Several other pieces of information are sent from the front
// end, specifically 7 floating point values per sphere as
// the uniform array `sphereData`. These floating point values
// are described below within a `struct Sphere`, giving the
// location, size, and material properties of each sphere.
//
// There is also an array `curvePoints` which gives the floor
// 2D points specifying the footprint of the curved Bezier
// mirror.
//
// Currently, the code treats sphere #0 as a mirrored surface.
// This happens in the function `rayIntersectMirror`. Your
// assignment is to write this code so that the mirror can
// instead be a curved Bezier sheet.
//

precision highp float;
precision highp int;

varying vec2 ray_offset; // Value from [-1,1]^2 for the ray offset.

uniform vec4 eyePosition;     // Point to start tracing each ray.
uniform vec4 intoDirection;   // Direction of the camera.
uniform vec4 rightDirection;  // Camera right.
uniform vec4 upDirection;     // Camera up.

uniform vec3 lightColor;      // Color of the light.
uniform vec4 lightPosition;   // Position of the light.

uniform int curvedMirror;     // Mirror shape (0 = sphere; 1 = curved)
uniform float sphereData[70]; // Position/size/color of spheres.
uniform int numSpheres;       // Number of valid spheres in the above.

uniform float controlPoints[6]; // Control points of the Beziér mirror.

#define FAR 10.0
#define EPSILON 0.000001

// struct Sphere (* not actually used! *)
//
// This struct serves to remind us of the layout of sphereData.
// There are seven consecutive floating point values that describe
// a sphere in the scene.
//
struct Sphere {
    float cx; // Center of the sphere.
    float cy;
    float cz;
    //
    float r; // Radius of the sphere.
    //
    float red; // Material of the sphere.
    float green;
    float blue;
};

// struct ISect
//
// Struct for recording ray-object intersection info.
//
struct ISect {
    int yes;        // Is it an intersection? (1 = yes, 0 = no)
                    //
    float distance; // If so, what's the distance from the ray's origin?
    vec4 location;  // Where did the ray intersect the object?
    vec4 normal;    // What was the surface normal where it intersected?
    //
    vec3 materialColor; // What are the surface material's properties?
    int materialGlossy; // Is it glossy? (1 = glossy, 0 = matte)
};

ISect NO_INTERSECTION() {

    //
    // Returns an ISect struct representing "no intersection" with
    // any scene object. Its `yes` component is set to 0, and the
    // others are filled with bogus values.
    //
    // This always loses in the `bestISect` comparison described
    // below.
    //

    return ISect(0, 
                 0.0,
                 vec4(0.0, 0.0, 0.0, 0.0),
                 vec4(0.0, 0.0, 0.0, 0.0),
                 vec3(0.0, 0.0, 0.0), 
                 0);
}

ISect bestISect(ISect info1, ISect info2) {

    //
    // Compare two intersections. If they are both `yes`, then
    // it returns the closer of the two.
    //
    // If either is not a `yes` it returns the other.
    //

    if (info2.yes == 1 && (info1.yes == 0 || info2.distance < info1.distance)) {
        return info2;
    } else {
        return info1;
    }
}

ISect rayIntersectPlane(vec4 R, vec4 d, vec4 P, vec4 n) {

    //
    // Check if a ray intersects an oriented plane.  Return an
    // `ISect` describing that intersection.
    //
    //    R, d: ray source point and direction.
    //    P, n: plane point and normal.
    //

    vec4 du = normalize(d);

    //
    // Check the signed height of the ray origin point above the plane.
    //
    float height = dot(R - P, n);
    if (height < EPSILON) {
        return NO_INTERSECTION();
    }

    //
    // Check whether the ray hits the plane.
    //
    float hits = dot(-du, n);
    if (hits < EPSILON) {
        // If the ray is pointing away from the plane...
        return NO_INTERSECTION();
    }

    // It hits the plane!

    //
    // Figure out distance the plane is away from the origin of the ray.
    //
    float distance = (height / hits);
    if (distance < EPSILON) {
        // If we are super-close to the plane, set to a minimum distance.
        distance = EPSILON;
    }

    //
    // Record and return the intersection info.
    //
    ISect isect;
    isect.yes = 1;
    isect.distance = distance;
    isect.location = R + distance * du;
    isect.normal = n;
    return isect;
}


// rayIntersect{Floor,*Wall,Ceiling,Entry}
//
// These functions check to see if a ray hits any of the four
// walls, the floor, or the ceiling of the cubical room housing
// the scene. Each is axis-aligned:
//  * The back wall and entrance have a normal of -/+ z.
//  * The left and right walls have a normal of +/- x.
//  * The floor and ceiling have a normal of +/- y.
//
// For the floor, the color calculation is complicated. It yields
// a tiling of two colors with a 5 x 5 checkerboard pattern. For
// the entrance, there is a door with a peephole and a door handle.
// The appropriate material color is set in `materialColor`.
//
// The materials of all these are matte and so
// `materialGlossy` is set to 0 for each.
//
ISect rayIntersectFloor(vec4 R, vec4 d) {
    ISect floor = rayIntersectPlane(R, d, vec4(0.0, 0.0, 1.0, 1.0),
                                          vec4(0.0, 1.0, 0.0, 0.0));
    if (floor.yes == 1) {
        // Checkerboard floor pattern.
        vec4 fl = floor.location;
        int i = 0;
        if (fl.x < -0.6) i++;
        if (fl.x < -0.2) i--;
        if (fl.x <  0.2) i++;
        if (fl.x <  0.6) i--;
        if (fl.z < 0.4)  i++;
        if (fl.z < 0.8)  i--;
        if (fl.z < 1.2)  i++;
        if (fl.z < 1.6)  i--;
        if (i == 0 || i == 2 || i == -2 || i == -4 || i == 4) {
            floor.materialColor = vec3(0.125, 0.175, 0.25); // dark green
        } else {
            floor.materialColor = vec3(0.125, 0.25, 0.175); // dark blue
        }
        floor.materialGlossy = 0;
    }
    return floor;
}

ISect rayIntersectLeftWall(vec4 R, vec4 d) {
    ISect left = rayIntersectPlane(R, d,
                                   vec4(-1.0, 1.0, 1.0, 1.0),
                                   vec4(1.0, 0.0, 0.0, 0.0));
    left.materialColor = vec3(0.6, 0.49, 0.48); // slate blue
    left.materialGlossy = 0;
    return left;
}

ISect rayIntersectRightWall(vec4 R, vec4 d) {
    ISect right = rayIntersectPlane(R, d,
                                    vec4(1.0, 1.0, 1.0, 1.0),
                                    vec4(-1.0, 0.0, 0.0, 0.0));
    right.materialColor = vec3(0.5, 0.59, 0.48); // olive-ish
    right.materialGlossy = 0;
    return right;
}

ISect rayIntersectBackWall(vec4 R, vec4 d) {
    ISect back = rayIntersectPlane(R, d,
                                   vec4(0.0, 1.0, 2.0, 1.0),
                                   vec4(0.0, 0.0, -1.0, 0.0));
    back.materialColor = vec3(0.60, 0.58, 0.55); // warm-ish white
    back.materialGlossy = 0;
    return back;
}
 
ISect rayIntersectCeiling(vec4 R, vec4 d) {
    ISect ceiling = rayIntersectPlane(R, d,
                                     vec4(0.0, 2.0, 1.0, 1.0),
                                     vec4(0.0, -1.0, 0.0, 0.0));
    ceiling.materialColor = vec3(0.5, 0.49, 0.48); // warm-ish gray
    ceiling.materialGlossy = 0;
    return ceiling;
}

ISect rayIntersectEntry(vec4 R, vec4 d) {
    ISect entry = rayIntersectPlane(R, d,
                                    vec4(0.0, 1.0, 0.0, 1.0),
                                    vec4(0.0, 0.0, 1.0, 0.0));
    if (entry.yes == 1) {
        if (abs(entry.location.x) < 0.3 && entry.location.y < 1.4) {
            //
            // The ray hits the door.
            //
            float handlex = entry.location.x - 0.24;
            float handley = entry.location.y - 0.72;
            float eyex = entry.location.x;
            float eyey = entry.location.y - 1.0;
            if (handlex * handlex + handley * handley < 0.04 * 0.04 
                || eyex * eyex + eyey * eyey < 0.01 * 0.01) {
                //
                // The ray hits the door handle or the peephole.
                //
                entry.materialColor = vec3(0.00, 0.00, 0.00); // black
            } else {
                //
                // Set to the door color.
                //
                entry.materialColor = vec3(0.43, 0.40, 0.17); // brown
            }
        } else {
            //
            // Set to the wall color.
            //
            entry.materialColor = vec3(0.43, 0.60, 0.67); // blue
        }
    }
    entry.materialGlossy = 0;
    return entry;
}

ISect rayClosestWall(vec4 R, vec4 d) {
    //
    // R, d: ray source point and direction.
    //
    // The `ISect` returns the color of that closest wall. 
    //

    ISect isect = NO_INTERSECTION();
    isect.materialColor = vec3(0.3, 0.2, 0.5); // Some sort of background.

    isect = bestISect(rayIntersectFloor(R, d), isect);     // floor
    isect = bestISect(rayIntersectLeftWall(R, d), isect);  // left wall
    isect = bestISect(rayIntersectRightWall(R, d), isect); // right wall
    isect = bestISect(rayIntersectBackWall(R, d), isect);  // back wall
    isect = bestISect(rayIntersectCeiling(R, d), isect);   // ceiling wall
    isect = bestISect(rayIntersectEntry(R, d), isect);     // entry wall

    return isect;
}

bool rayHitsSphereBefore(vec4 R, vec4 d, vec4 C, float r, float limit) {
    //
    // Check whether a ray intersects a sphere at at a distance smaller
    // than the given `limit`. Returns a boolean indicating whether the
    // sphere is hit.
    //
    //    R, d: ray source point and direction.
    //    C, r; sphere center point and radius
    //
    vec4 du = normalize(d);
    vec4 RtoC = C - R;

    float delta = dot(du, RtoC);
    float RtoC2 = dot(RtoC, RtoC);
    float leg2 = delta * delta - (RtoC2 - r * r);
    if (leg2 > EPSILON) {
        float distance = (delta - sqrt(leg2));
        if (distance > EPSILON && distance < limit) {
            return true;
	}
    }
    return false;
}

// RAY_HITS_SPHERE_BEFORE
//
// Below gives the code for a C/GLSL _macro_ whose code gets
// cut-n-pasted using it as a template. It is formatted as a
// single line using the \ characters. 
//
// The code below checks whether a ray hits a certain sphere
// in the room scene. The particular sphere is given by an
// integer INDEX and the sphere's info is accessed from the
// `sphereData` array of floats. HITS_ANY should be a
// variable of type `bool` and is set to `true` if the sphere is
// hit by the ray. DISTANCE is a value that needs to be beat
// by this ray-sphere intersection check.
//
// The ray is given by an ORIGIN point and DIRECTION vector.
// The code relies on `rayHitsSphereBefore` to do its work.
//
#define RAY_HITS_SPHERE_BEFORE(INDEX, ORIGIN, DIRECTION, DISTANCE, HITS_ANY)            \
    if (INDEX >= curvedMirror && INDEX < numSpheres) {                                  \
        float rhs_x = sphereData[INDEX * 7 + 0];                                        \
        float rhs_y = sphereData[INDEX * 7 + 1];                                        \
        float rhs_z = sphereData[INDEX * 7 + 2];                                        \
        float rhs_r = sphereData[INDEX * 7 + 3];                                        \
        vec4 rhs_c = vec4(rhs_x, rhs_y, rhs_z, 1.0);                                    \
        bool rhs_hits = rayHitsSphereBefore(ORIGIN, DIRECTION, rhs_c, rhs_r, DISTANCE); \
        HITS_ANY = HITS_ANY || rhs_hits;                                                \
    };

ISect rayIntersectBezier(vec4 R, vec4 d, vec2 cp0, vec2 cp1, vec2 cp2);

bool rayHitsBezierBefore(vec4 R, vec4 d, vec2 cp0, vec2 cp1, vec2 cp2, float distance) {
    //
    // This should return `true` if shooting a ray from point
    // `R` in a direction `d` hits a Bezier mirror before
    // traveling a given `distance`.
    //
    // The mirror is given by control points whose floor
    // coordinates sit at `cp0`, `cp1`, and `cp2`. You can make
    // the mirror have any height you like. My demo used a
    // height of 1.5.
    //
    // This is used to see the mirror's shadow.
    //

    // if we wanted to be really efficient, we should duplicate the implementation without the slerp
    ISect i = rayIntersectBezier(R, d, cp0, cp1, cp2);
    if (i.yes == 0) return false;

    return i.distance < distance;
}

bool rayHitsMirrorBefore(vec4 R, vec4 d, float distance) {
    bool hits = false;
    if (curvedMirror == 0) {
        RAY_HITS_SPHERE_BEFORE(0, R, d, distance, hits);
    } else {
        vec2 cp0 = vec2(controlPoints[0], controlPoints[1]);
        vec2 cp1 = vec2(controlPoints[2], controlPoints[3]);
        vec2 cp2 = vec2(controlPoints[4], controlPoints[5]);
        hits = rayHitsBezierBefore(R, d, cp0, cp1, cp2, distance);
    }
    return hits;
}

bool rayHitsSomeSphereBefore(vec4 R, vec4 d, float distance) {
    //
    // Determine whether or not a ray hits some sphere
    // in the scene. Returns a boolean indicating whether
    // some sphere was hit.
    //
    //    R, d: ray source point and direction.
    //
    bool hitsSphere = false;
    RAY_HITS_SPHERE_BEFORE(1, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(2, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(3, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(4, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(5, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(6, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(7, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(8, R, d, distance, hitsSphere);
    RAY_HITS_SPHERE_BEFORE(9, R, d, distance, hitsSphere);
    return hitsSphere;
}

vec3 computePhong(vec4 P, vec4 n, vec4 V, vec4 L, vec3 mColor, int mGlossy) {
    //
    // Figures out Phong shading of an object at a surface point P with
    // normal n, and with respect to some light at point L, when viewed
    // from point V. The material's properties are specified with
    // `mColor` and `mGlossy`, giving the RGB of the color reflected
    // and whether the material is glossy (set to 1) or matte (set to 0).
    //
    // The surface point might be in shadow, so we check occlusion by
    // seeing whether a ray between the surface point and the light
    // is obstructed by an object in the scene.
    //
    // This returns an RGB vec3 of the Phong shading's color.
    //
    //   P: surface point
    //   n: normal direction at that surface point
    //   V: point from which the surface is being viewed
    //   L: point from which the surface is being illuminated
    //
    //   mColor, mGlossy: material color, shine
    //

    //
    // If in shadow, ambient reflection only.
    //

    float ambientMix = 0.75;
    vec4 towardsLight = L - P;
    vec3 ambient = ambientMix * lightColor * mColor;
    //
    float within = length(towardsLight);
    bool occluded = rayHitsSomeSphereBefore(P, towardsLight, within);
    occluded = occluded || rayHitsMirrorBefore(P, towardsLight, within);
    if (occluded) {
        // The surface point is in shadow from the light.
        return ambient;
    }

    //
    // If light is behind the surface, then ambient reflection only.
    //
    vec4 l = normalize(towardsLight);
    if (dot(l, n) < EPSILON) {
        // The surface point is in shadow from the light.
        return ambient;
    }

    //
    // If the surface is matte, not glossy, then diffuse reflection.
    //
    float diffuseMix = 0.9;
    vec3 diffuse = diffuseMix * lightColor * mColor * dot(l, n);
    if (mGlossy == 0) {
        return ambient + diffuse;
    }

    //
    // If glossy, then compute a specular highlight component.
    //
    float shininess = 20.0;
    float specularMix = 0.3;
    //
    vec4 v = normalize(V - P);
    vec4 r = normalize(-l + 2.0 * dot(l, n) * n);
    float p = pow(max(dot(v, r), 0.0), shininess);
    //
    vec3 specular = specularMix * lightColor * p * dot(l, n);
    return ambient + diffuse + specular;
}

ISect rayIntersectSphere(vec4 R, vec4 d, vec4 C, float r) {
    //
    // Check if a ray intersects a sphere.
    //
    //    R, d: ray source point and direction.
    //    C, r: sphere center point and radius
    //
    // Fill in the (non-material) information of an `ISect`
    // struct if the sphere is hit by the ray; return that
    // info.
    //

    vec4 du = normalize(d);
    vec4 RtoC = C - R;

    float delta = dot(du, RtoC);
    float RtoC2 = dot(RtoC, RtoC);
    float leg2 = delta * delta - (RtoC2 - r * r);
    if (leg2 > EPSILON) {
        float distance = (delta - sqrt(leg2));
        if (distance > EPSILON) {
            vec4 location = R + distance * du;
            //
            ISect isect;
            isect.yes = 1;
            isect.distance = distance;
            isect.location = location;
            isect.normal = normalize(location - C);
            return isect;
        }
    }
    return NO_INTERSECTION();
}

// CHECK_SPHERE_WITH_RAY
//
// Below gives the code for a C/GLSL _macro_ whose code gets
// cut-n-pasted using it as a template. It is formatted as a
// single line using the \ characters. 
//
// The code below checks whether a ray intersects a certain
// sphere in the room scene. The particular sphere is given by
// an integer INDEX and the sphere's info is accessed from the
// `sphereData` array of floats. The INFO is expected to be
// a variable of type `ISect` and it records an intersection,
// if found, with that particular sphere. It only updates
// that INFO if the intersection is found closer to the eye
// point than the given info held by INFO.
//
// The ray is given by an ORIGIN point and DIRECTION vector.
// The code relies on `rayIntersectSphere` to check inter-
// section.
//

#define CHECK_SPHERE_WITH_RAY(INDEX, ORIGIN, DIRECTION, INFO)         \
    if (INDEX < numSpheres) {                                         \
        float cswr_x = sphereData[INDEX * 7 + 0];                     \
        float cswr_y = sphereData[INDEX * 7 + 1];                     \
        float cswr_z = sphereData[INDEX * 7 + 2];                     \
        float cswr_r = sphereData[INDEX * 7 + 3];                     \
        float cswr_R = sphereData[INDEX * 7 + 4];                     \
        float cswr_G = sphereData[INDEX * 7 + 5];                     \
        float cswr_B = sphereData[INDEX * 7 + 6];                     \
        vec4 cswr_c = vec4(cswr_x, cswr_y, cswr_z, 1.0);              \
        ISect cswr;                                                   \
        cswr = rayIntersectSphere(ORIGIN, DIRECTION, cswr_c, cswr_r); \
        cswr.materialColor = vec3(cswr_R, cswr_G, cswr_B);            \
        cswr.materialGlossy = 1;                                      \
        INFO = bestISect(INFO, cswr);                                 \
    };

ISect rayClosestSphere(vec4 R, vec4 d) {
    //
    // Checks each of the scene spheres, up to 10, to see
    // which of them (if any) are hit closest to the source
    // of some ray.
    //
    // The ray comes from point R in the direction d.
    //

    ISect isect = NO_INTERSECTION();
    // CHECK_SPHERE_WITH_RAY(0, R, d, isect); // Sphere #0 is a mirror.
    CHECK_SPHERE_WITH_RAY(1, R, d, isect);
    CHECK_SPHERE_WITH_RAY(2, R, d, isect);
    CHECK_SPHERE_WITH_RAY(3, R, d, isect);
    CHECK_SPHERE_WITH_RAY(4, R, d, isect);
    CHECK_SPHERE_WITH_RAY(5, R, d, isect);
    CHECK_SPHERE_WITH_RAY(6, R, d, isect);
    CHECK_SPHERE_WITH_RAY(7, R, d, isect);
    CHECK_SPHERE_WITH_RAY(8, R, d, isect);
    CHECK_SPHERE_WITH_RAY(9, R, d, isect);

    return isect;
}

ISect rayIntersectPanel(vec4 R, vec4 d, vec3 p0, vec3 p1, vec3 normal) {
    float HEIGHT = 1.5;

    // If the ray is "opposite" the normal
    ISect hit = rayIntersectPlane(R, d, vec4(p0, 1.0), vec4(normal, 0.0));
    if (hit.yes == 1) {
        // Vector along the base of the panel
        vec3 diff = p1 - p0;
        // "x" coordinate (along that vector) of the location of the hit
        float distanceInVector = dot(vec3(hit.location) - p0, diff);
        // I don't understand why this is length^2 (diff dotted with itself) instead of just length
        if (distanceInVector > EPSILON && dot(diff, diff) > distanceInVector && HEIGHT > hit.location.y && hit.location.y > EPSILON) {
            return hit;
        }
    }

    // If the ray is "parallel" the normal
    hit = rayIntersectPlane(R, d, vec4(p0, 1.0), vec4(-normal, 0.0));
    if (hit.yes == 1) {
        // Vector along the base of the panel
        vec3 diff = p1 - p0;
        // "x" coordinate (along that vector) of the location of the hit
        float distanceInVector = dot(vec3(hit.location) - p0, diff);
        // I don't understand why this is length^2 (diff dotted with itself) instead of just length
        if (distanceInVector > EPSILON && dot(diff, diff) > distanceInVector && HEIGHT > hit.location.y && hit.location.y > EPSILON) {
            return hit;
        }
    }

    return NO_INTERSECTION();
}

void subdivide5(inout vec2[3] into, vec2 p0, vec2 p1, vec2 p2) {
    into[0] = p0;
    into[1] = p1;
    into[2] = p2;
}

void subdivide4(inout vec2[6] into, vec2 p0, vec2 p1, vec2 p2) {
    vec2 p01 = p0 + ((p1 - p0) / 2.0);
    vec2 p12 = p2 + ((p1 - p2) / 2.0);
    vec2 p012 = p01 + ((p12 - p01) / 2.0);

    const int LENGTH = 3;

    vec2 left[LENGTH];
    subdivide5(left, p0, p01, p012);
    vec2 right[LENGTH];
    subdivide5(right, p012, p12, p2);

    for (int i = 0; i < LENGTH + LENGTH; ++i) {
        into[i] = i < LENGTH ? left[i] : right[i - LENGTH];
    }
}

void subdivide3(inout vec2[12] into, vec2 p0, vec2 p1, vec2 p2) {
    vec2 p01 = p0 + ((p1 - p0) / 2.0);
    vec2 p12 = p2 + ((p1 - p2) / 2.0);
    vec2 p012 = p01 + ((p12 - p01) / 2.0);

    const int LENGTH = 6;

    vec2 left[LENGTH];
    subdivide4(left, p0, p01, p012);
    vec2 right[LENGTH];
    subdivide4(right, p012, p12, p2);

    for (int i = 0; i < LENGTH + LENGTH; ++i) {
        into[i] = i < LENGTH ? left[i] : right[i - LENGTH];
    }
}

void subdivide2(inout vec2[24] into, vec2 p0, vec2 p1, vec2 p2) {
    vec2 p01 = p0 + ((p1 - p0) / 2.0);
    vec2 p12 = p2 + ((p1 - p2) / 2.0);
    vec2 p012 = p01 + ((p12 - p01) / 2.0);

    const int LENGTH = 12;

    vec2 left[LENGTH];
    subdivide3(left, p0, p01, p012);
    vec2 right[LENGTH];
    subdivide3(right, p012, p12, p2);

    for (int i = 0; i < LENGTH + LENGTH; ++i) {
        into[i] = i < LENGTH ? left[i] : right[i - LENGTH];
    }
}

void subdivide1(inout vec2[48] into, vec2 p0, vec2 p1, vec2 p2) {
    vec2 p01 = p0 + ((p1 - p0) / 2.0);
    vec2 p12 = p2 + ((p1 - p2) / 2.0);
    vec2 p012 = p01 + ((p12 - p01) / 2.0);

    const int LENGTH = 24;

    vec2 left[LENGTH];
    subdivide2(left, p0, p01, p012);
    vec2 right[LENGTH];
    subdivide2(right, p012, p12, p2);

    for (int i = 0; i < LENGTH + LENGTH; ++i) {
        into[i] = i < LENGTH ? left[i] : right[i - LENGTH];
    }
}

void subdivide(inout vec2[96] into, vec2 p0, vec2 p1, vec2 p2) {
    vec2 p01 = p0 + ((p1 - p0) / 2.0);
    vec2 p12 = p2 + ((p1 - p2) / 2.0);
    vec2 p012 = p01 + ((p12 - p01) / 2.0);

    const int LENGTH = 48;

    vec2 left[LENGTH];
    subdivide1(left, p0, p01, p012);
    vec2 right[LENGTH];
    subdivide1(right, p012, p12, p2);

    for (int i = 0; i < LENGTH + LENGTH; ++i) {
        into[i] = i < LENGTH ? left[i] : right[i - LENGTH];
    }
}

ISect rayIntersectBezier(vec4 R, vec4 d, vec2 cp0, vec2 cp1, vec2 cp2) {
    //
    // This should return intersection information that results
    // from shooting a ray from point `R` in a direction `d`,
    // possibly hitting a Bezier mirror. If the mirror is hit,
    // then the ISect struct should contain the location point
    // where it was hit, the surface normal where it was hit,
    // and its distance from the point along that ray. The `yes`
    // component of the `ISect` should be set to 1.
    //
    // If they don't intersect, return NO_INTERSECTION().
    //
    // The mirror is given by control points whose floor
    // coordinates sit at `cp0`, `cp1`, and `cp2`. You can make
    // the mirror have any height you like. My demo used a
    // height of 1.5.
    //
    const vec3 UP = vec3(0.0, 1.0, 0.0);
    const int POINT_COUNT = 96;
    // const int POINT_COUNT = 48;

    vec2 points[POINT_COUNT];
    subdivide(points, cp0, cp1, cp2);
    // subdivide1(points, cp0, cp1, cp2);

    for (int i = 0; i < POINT_COUNT - 1; ++i) {
        vec2 _p0 = points[i];
        vec3 p0 = vec3(_p0.x, 0.0, _p0.y);
        vec2 _p1 = points[i+1];
        vec3 p1 = vec3(_p1.x, 0.0, _p1.y);

        vec3 norm = normalize(cross(p1 - p0, UP));

        // if (i == 0) {
        //     norm = normalize(cross(vec3(cp0.x, 0.0, cp0.y) - vec3(cp1.x, 0.0, cp1.y), UP));
        // }

        ISect hit = rayIntersectPanel(R, d, p0, p1, norm);

        if (hit.yes == 1) {
            if (i >= POINT_COUNT - 3) { return hit; }
            // float t = distance(vec2(hit.location.xz), _p0) / distance(_p0, _p1);
            vec2 l = vec2(hit.location.xz);
            float sum = distance(l ,_p0) + distance(l, _p1);
            float s0 = distance(l, _p0) / sum;
            float s1 = distance(l, _p1) / sum;
            vec2 _p2 = points[i+2];
            vec3 p2 = vec3(_p2.x, 0.0, _p2.y);
            vec3 next_norm = normalize(cross(p2 - p1, UP));
            vec3 new_norm = norm * s0 + next_norm * s1;
            hit.normal = vec4(new_norm, 0.0);
            return hit;
        }
    }

    return NO_INTERSECTION();
}

ISect rayIntersectMirror(vec4 R, vec4 d) {
    //
    // Checks whether a ray hits the one mirrored object in the
    // scene. Currently, this is a sphere. Your assignment is to
    // change this code to check intersection with a curved
    // mirror.
    //
    // The ray comes from point R in the direction d.
    //

    ISect isect = NO_INTERSECTION();

    //
    // Right now, checks intersection with Sphere #0.
    //
    if (curvedMirror == 0) {
        CHECK_SPHERE_WITH_RAY(0, R, d, isect);
    } else {
        vec2 cp0 = vec2(controlPoints[0], controlPoints[1]);
        vec2 cp1 = vec2(controlPoints[2], controlPoints[3]);
        vec2 cp2 = vec2(controlPoints[4], controlPoints[5]);
        isect = rayIntersectBezier(R, d, cp0, cp1, cp2);
    }

    return isect;
}

vec3 trace(vec4 R, vec4 d) {
    //
    // Traces a ray from the eye point R, through the virtual
    // screen pixel in direction d out into the scene.  The
    // scene consists of a collection of spheres, one mirrored
    // surface, and a cubicle room. It has one point light
    // source sitting in the room.
    //
    // The ray comes from point R in the direction d.
    //
    // It traces 2 or 3 rays, depending on what's hit by the
    // primary ray.
    //
    // It shoots only two rays when the primary ray directly
    // hits a glossy object (a sphere) or a matte room bounding
    // surface (e.g. wall, ceiling). In this case, a RGB color
    // is returned. That color is computed according to Phong's
    // model, though that object might be in shadow from the
    // light.  We check if it is in shadow by shooting a
    // secondary ray from the surface point to the light
    // source, seeing if any object is hit.
    //
    // It shoots three rays when the primary ray hits a mirrored
    // surface. In that case a secondary reflection ray is
    // shot, much in the same way the primary ray is shot as
    // described above, in order to see what matte/glossy object
    // is hit.
    //
    // (Note: This would normally be written recursively but
    //  GLSL does not allow that so as to work well on GPU
    //  hardware.)

    //
    // See if it hits the mirrored object...
    //
    ISect mirror = rayIntersectMirror(R, d);

    //
    // If it does not hit the mirror, we see what object the
    // primary ray hits.
    //
    vec4 source = R;
    vec4 direction = d;

    //
    // If it does hit the mirror, and nothing is blocking that
    // ray from hitting the mirror, instead send a secondary ray
    // due to reflection to see what object *it* hits.
    //
    if (mirror.yes == 1) {
        bool blocked = rayHitsSomeSphereBefore(mirror.location, -d, FAR);
        if (!blocked) {
            //
            // Compute the reflected ray.
            //
            source = mirror.location;
            vec4 n = normalize(mirror.normal);
            direction = normalize(d - 2.0 * dot(d, n) * n);
        }
    }

    // Find out the color of the surface hit...

    //
    // If nothing gets hit, set to some background color.
    // (Make notable because we expect *something* to be hit.)
    //
    vec3 color = vec3(1.0, 0.8, 0.0);

    //
    // Does it hit any of the spheres in the scene?
    //
    ISect sphere = rayClosestSphere(source, direction);
    //
    // What wall does it hit?
    //
    ISect wall = rayClosestWall(source, direction);
    //
    // Which is closer?
    //
    ISect isect = bestISect(wall, sphere);
    //
    // Compute the color bouncing off that surface....
    //
    if (isect.yes == 1) {
        color = computePhong(isect.location, isect.normal,
                             source, lightPosition,
                             isect.materialColor,
                             isect.materialGlossy);
    }
    return color;
}

//
// main
//
// GLSL to perform ray tracing of a simple scene.
//
// Shoots rays from an eye point `eyePosition` out through a
// pixel as specified by the vec2 `jitter`, using the orthonormal
// basis of direction vectors given by
//
//  * into-/right-/up-Direction
//
// to determine the direction of the ray(s).
//
// A SAMPLES x SAMPLES collection of rays are sent through the
// pixel in the pattern of a regularly spaced grid.
//
// The result of this series of traced rays is an averaged RGB
// value, averaged from the Phong shading and reflection
// determined from the objects hit by the ray into the scene.
//
// Through GLSL, that average RGB value is painted as the pixel
// in the WebGL display.

#define SAMPLES 2
#define FSAMPLES 2.0

void main(void) {
    float delta = 1.0 / FSAMPLES / 512.0;
    vec3 color = vec3(0.0, 0.0, 0.0);

    //
    // Shoot a SAMPLES x SAMPLES array of rays for this pixel.
    //
    float dx = 0.0;
    for (int xoffset = 0; xoffset < SAMPLES; xoffset++) {
        float dy = 0.0;
        for (int yoffset = 0; yoffset < SAMPLES; yoffset++) {

            //
            // Trace a ray from the eye, into the scene.
            //

            //
            // Offset the ray slightly from the pixel center.
            //
            vec4 rayDirection = intoDirection 
                + (ray_offset.x + dx) * rightDirection
                + (ray_offset.y + dy) * upDirection;

            //
            // See what color would hit the eye. Add it to
            // this pixel's average of colors.
            //
            color += trace(eyePosition, rayDirection);

            dy += delta;
        }
        dx += delta;
    }

    //
    // Compute the average color found by each traced ray.
    //
    color = color * (1.0 / FSAMPLES / FSAMPLES);

    //
    // Tell WebGL the color computed for this pixel.
    //
    gl_FragColor = vec4(color, 1.0);
}

