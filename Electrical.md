# Notes on the electrical design of the Sojourner rover
Christopher Bovee, January 2026

As a spaceflight nerd and robiticist I am fascinated with the control systems of the Sojourner Rover.
The pathfinder mission was designed under heavy budget constraints which pushed engineers to develop new methods. 
(Viking budget: >$1 billion, Pathfinder: $280 million). 



###Commercial Off The Shelf parts:

Motors: Maxon RE163 (sometimes "RE016") with single output shaft. [This document details what modifications were required for the motors to survive the low pressure environment.](https://www.esmats.eu/amspapers/pastpapers/pdfs/2012/phillips.pdf)

Potentiometers: [BI precision 61735 utilizing a "conductive plastic" element material](https://www.ttelectronics.com/products/passive-components/potentiometers/6173) 4 of these are used for steering position feedback.

'Bumper' contact switches are [Honeywell MH](https://www.mouser.fr/c/electromechanical/switches/basic-snap-action-switches/?m=Honeywell&series=HM)

CPU: radiation-qualified 8085 running at 100 KIPS. All software was written in C. [JPL blurb](https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/pathfinder/software-electronics/)
The 8085 CPU is from March 1976. It is an improvement on the 8080 CPU which was released in April 1974.





## Materials Adherence Experiment (MAE)

The MAE is installed in the front left corner cutout of Sojourner's solar panel. Marie Curie lacks this experiment.

"The purpose of this instrument was to make ameasurement by which degradation of the array output dueto dust coverage could be reliably separated fromdegradation due to other causes or changes in output dueto variations in the solar intensity at the surface.
The MAE has two instruments: a quartz crystal microbalance, and a shorted GaAs solar cell fitted with a removable cover glass. (It also includes a temperature sensor and an open-circuit solar cell used to monitor the solar-array maximum-power point.)
The MAE solar cell experiment uses the GaAs solar cell with a removable cover glass to measure optical obscuration caused by settling dust. 
During the course ofthe mission, the cover glass on the shorted cell is occasionally rotated away from its normal position in frontof the solar cell, and the short circuit current (Isc) ismeasured. 
Comparing Isc with and without the cover glassin place measures the optical obscuration of the glasssurface by dust on the cover, plus the reflectance of thecover glass itself. 
The known reflectance of the coverglass is then subtracted out, to give the amount of obscuration due to dust." [Dust on Mars](https://github.com/user-attachments/files/25053947/dustonmars.pdf)



![MAE_Integration_Model](https://github.com/user-attachments/assets/299c6a7d-684c-4d94-a917-36554367f42e) 

This blurb about the function of the MAE comes from an EEr who designed a board which evaluates the MAE:

"The sensor outputted a sine wave (-ish), the frequency of which was the difference frequency between two crystals in an oscillator/mixer circuit. 
One crystal was shielded from the dusty atmosphere, the other, coated with vacuum grease (as glue) was exposed. Dust falling onto the exposed crystal became fixed and effectively changed its mass. 
Thus, the difference frequency was proportional to the mass difference between the two crystals and a direct function of accumulated dust mass. 
The sensor output was squared up by a comparator whose output went to the counter input of the micro. So we directly measured frequency. This board was within the WEB.

<img width="1504" height="2016" alt="image" src="https://github.com/user-attachments/assets/15965645-6938-4bef-8d79-0e00e6b98eaf" />



## Rover Control Workstation (RCW)

The RCW is the computer system used on earth to assess the rover's position and to generate and send commands the operate the rover.



This file is a work in progress. To be discussed is the radio hardware, power management and lifetime, thermal management and the WEB, Motor controller hardware, Intertial measurement sensors, connectors and wires, and other experiments' electrical considerations such as the APXS.
