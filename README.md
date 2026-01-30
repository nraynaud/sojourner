# Notes on the mechanical design of the Sojourner rover
Nicolas Raynaud, February 2025

Wanting to build a fun robot mower, I studied the Sojourner rover as a base for my design. 
When looking at online 3D models, I fell into the rabbit hole of accuracy of historical artefact description. 
My goal in this document is to show the smart that JPL put in this little rover.

## Marie Curie
The Marie Curie rover is a double for Sojourner, two rovers were built at the same time and the best one was selected to be sent to space. 
Today the Marie Curie rover is exposed at the National Air and Space Museum in DC. Most high resolution photos available are from this rover 
since the other one left earth in 1996, fong before we had hight resolution digital cameras in our pockets. 

Marie Curie was poised to receive some modifications and be sent to Mars at a later date, it look like some modifications have already been made, so it is not strickly identical to Sojourner.

### Differences with Sojourner
 - the antenna hook has been removed
 - the Wheel Abrasion Experiment is missing
 - the Material Adhesion Experiment is missing (but the notch is here)
 - the front solar panel bumper has been cut and re-painted without respecting the 10cm pattern
 - there seem to be a small difference in the cleat folding pattern between the 2 rovers

## Document search
A lot of scientific publications offer clues about the inner working of the rover. Some of them are so old that the pictures are very bad, but sometimes the publisher has a better copy in print.

JPL archives were not forthcoming with high res pictures, they had contentions with a documentation precise enough to be able to build a replica of the rover, it is US Federal IP and they don't want to encourage copies. I didn't push the discussion further to avoid wasting my correspondent's time, they didn't give me any references about archives policies.

The old JPL website is still available on the Wayback Machine: https://web.archive.org/web/20160118204242/http://mars.jpl.nasa.gov/MPF/rovercom/pixt.html.

Follow-up missions used the same building block as Sojourner, in particular, the cancelled '01 Surveyor mission and the INSIGHT mission[^5].

The most important documents are the very high resolution pictures (8688×5792px) of Marie Curie taken the Air and Space Museum in DC, they are available in [Open Acces](https://www.si.edu/object/rover-marie-curie-mars-pathfinder-engineering-test-vehicle:nasm_A20150317000)

The [rover telemetry](https://planetarydata.jpl.nasa.gov/img/data/mpf/rover/mprv_0001/) is available online.

## Off-the-shelf parts
Commercial parts can help make sense of scale on the pictures.
 - Most screws are assumed to be metric[^1].
 - The motors are [Maxon RE16](https://www.maxongroup.fr/maxon/view/product/motor/dcmotor/re/re16/118690)[^2] (sometimes "RE016") with a single output shaft[^3], whose documentation is still available online. 
 - The potentiometers are [BI precision 6173](https://www.ttelectronics.com/products/passive-components/potentiometers/6173)[^4] (identified by the part number on pictures), whose documentation is also available online. 
 - The gearboxes are described as "Globe Motors" 5 stages planetary gearboxes, but sadly this company has disappeared and I couldn't identify the gearbox
 
## Documented dimensions
They are generally ambiguous, I have color coded the various instances of the same dimension.
 - $${\color{red}630 \space mm}$$ long [^6]
 - cleats that protrude 10 millimeters [^6]
 - $${\color{magenta}79-millimeter}$$-wide wheels [^6]
 - Each wheel of the rover is $${\color{cyan}13 \space cm}$$ in diameter and $${\color{magenta}6 \space cm}$$ wide [^7]
 - the rover has a 74cm turning diameter [^7]
 - The rover is $${\color{red}65 \space cm}$$ in length, $${\color{green}48 \space cm}$$ wide and $${\color{yellow}30 \space cm}$$ tall in its deployed configuration [^7]
 - In this stowed position, the rover height is reduced to $${\color{orange}19 \space cm}$$. [^7]
 - In the deployed configuration, the rover has ground clearance of 15cm. [^7]
 - solar panel comprised of 13 strings of 18, GaAs cells each of size 2cm by 4cm. [^7]
 - wheel radius $${\color{cyan}(6.5 \space cm)}$$ [^7]
 - (APXS) a 0.076 m diameter bumper [^8]
 - $${\color{red}68 \space cm}$$ long by $${\color{green}48 \space cm}$$ wide by $${\color{yellow}28 \space cm}$$ high [^9]
 - Deployed Dimensions, cm: Length $${\color{red}62}$$, Width $${\color{green}47}$$, Height $${\color{yellow}32}$$ [^10]
 - Wheels (Six), cm: Diameter $${\color{cyan}13}$$, Width $${\color{magenta}6}$$ [^10]
 - Forward camera separation 12.56 cm [^10]
 - Approximate (camera) height above surface 26 cm [^10]
 - The rover stands $${\color{yellow}300 \space mm}$$ tall but stows to $${\color{orange}180 \space mm}$$ [^11]
 - Sojourner, when stowed, is $${\color{red}650 \space mm}$$ long and $${\color{green}480 \space mm}$$ wide with $${\color{cyan}130 \space mm}$$ diameter wheels, $${\color{magenta}80 \space mm}$$ wide. [^11]
 - The wheel cleats protrude 10 millimeters [^12]
 - The wheels are $${\color{magenta}79 \space millimeters}$$ wide [^12]
 - Sojourner (Figures 1 & 2) is a six-wheeled vehicle $${\color{red}68 \space cm}$$ long, $${\color{green}48 \space cm}$$ wide, and $${\color{yellow}28 \space cm}$$ high (with 17 cm ground clearance)[^13]
 - one dimension was found in a photogrammetry paper: "Taking the distances between point 1 and 4 or 2 and 3, the rover was measured to have a length of 41.6 and 42.8 cm, respectively, in excellent agreement with the nominal size of 41.6 cm."[^14]

## Direct measurements
GearSkeptic on Youtube has access to a rover wheel, here are the measurements he took:

Ok, here are some measurements with a digital caliper:
 - Rim diameter $${\color{cyan}120mm}$$
 - Rim width $${\color{magenta}80.17mm}$$
 - Tire width 70.76mm
 - Cleat prominence 6.27mm
 - (...the cleats...) are 11mm wide.
 


[^1]: "With few exceptions, all Pathfinder’s parts are metric sized, from its nuts and bolts to its 10-kilogram (22-pound) robotic rover" https://www.latimes.com/archives/la-xpm-1995-02-21-mn-34480-story.html
[^2]: "the Maxon  RE016  motor which had been used successfully on the Mars  Sojourner  Rover" Braun, David & Noon, Don. (1998). "Long life" DC brush motor for use on the Mars surveyor program. https://www.researchgate.net/publication/23604427_Long_life_DC_brush_motor_for_use_on_the_Mars_surveyor_program
[^3]: "in the 2 years between the Sojourner  and  Robotic Arm programs, Maxon  began offering  ball  bearings  and  a double-ended  shaft on the RE016" ibid.
[^4]: "Steering position was read directly via a conductive plastic Beckman potentiometer" Eisen, Howard & Buck, Carl & Gillis-Smith, Greg & Umland, Jeffrey. (1997). Mechanical Design of the Mars Pathfinder Mission. 
[^5]: "The [Instrument Deployment Arm (IDA)] originated as the robotic arm built for the Jet Propulsion Laboratory (JPL) for the cancelled Mars 2001 Surveyor mission in 1998. The IDA is slated for refurbishment" Fleischner, R., “InSight Instrument Deployment Arm”, in 15th European Space Mechanisms and Tribology Symposium, 2013, vol. 718, Art. no. 14. https://esmats.eu/esmatspapers/pastpapers/pdfs/2013/fleischner.pdf

[^6]: Bickler, D. (April 1, 1998). "Roving Over Mars." ASME. Mechanical Engineering. April 1998; 120(04): 74–77. https://doi.org/10.1115/1.1998-APR-6
[^7]: Matijevic, J. (1997) "Sojourner: The Mars Pathfinder Microrover Flight Experiment" preprint https://ntrs.nasa.gov/citations/20060034938
[^8]: Blomquist, R. S., “The Alpha-Proton-X-ray Spectrometer deployment mechanism: an anthropomorphic approach to sensor placement on Martian rocks and soil”, in <i>29th Aerospace Mechanisms Symposium</i>, 1995, pp. 61–78. https://ntrs.nasa.gov/api/citations/19950020845/downloads/19950020845.pdf
[^9]: Cooper, B. (June 1, 1998), "Driving on the Surface of Mars Using the Rover Control Workstation" https://citeseerx.ist.psu.edu/document?repid=rep1&type=pdf&doi=aa6b2554315747f2399d41b9f2c362d95748b8f3
[^10]: (1997), The Pathfinder Microrover, J. Geophys. Res., 102(E2), 3989–4001, doi:10.1029/96JE01922 https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/96JE01922
[^11]: Eisen, H. J. "Mechanical Design of the Mars Pathfinder Mission", 1997ESASP.410..293E, https://adsabs.harvard.edu/full/1997ESASP.410..293E
[^12]: Bickler, D. (December 1, 1997) "The Mars Rover Mobility System" https://web.archive.org/web/20100526143429/http://trs-new.jpl.nasa.gov/dspace/bitstream/2014/18908/1/98-0011.pdf
[^13]: Wilcox, B., and Nguyen, T., "Sojourner on Mars and Lessons Learned for Future Planetary Rovers," SAE Technical Paper 981695, 1998, https://doi.org/10.4271/981695.
[^14]:   Oberst, J. and Hauber, E. and Trauthan, F. and Kuschel, M. and Giese, B. and Roatsch, T. and Jaumann, R.  (1998) Mars Pathfinder: Photogrammetric processing of lander images.  International Archives of Photogrammetry and Remote Sensing, 32 (Part 4), pp. 436-443. https://citeseerx.ist.psu.edu/document?repid=rep1&type=pdf&doi=26bdd608f9ece8a8417adfb931b99389693513ec
