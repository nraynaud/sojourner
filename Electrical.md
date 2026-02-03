# Notes on the electrical design of the Sojourner rover
Christopher Bovee, January 2026

As a spaceflight nerd and robiticist I am fascinated with the control systems of the Sojourner Rover.
The pathfinder mission was designed under heavy budget constraints which pushed engineers to develop new methods.



### Commercial Off The Shelf parts:

Motors: Maxon RE163 (sometimes "RE016") with single output shaft. [This document details what modifications were required for the motors to survive the low pressure environment.](https://www.esmats.eu/amspapers/pastpapers/pdfs/2012/phillips.pdf)

Potentiometers: [BI precision 61735 utilizing a "conductive plastic" element material](https://www.ttelectronics.com/products/passive-components/potentiometers/6173) 4 of these are used for steering position feedback.

'Bumper' contact switches are [Honeywell MH](https://www.mouser.fr/c/electromechanical/switches/basic-snap-action-switches/?m=Honeywell&series=HM)




## Main computer:

"The "brain" of the MFEX Microrover (Sojourner) is comprised of two electronics boards interconnected to one another, the sensors within the WEB (Warm Electronics Box), 
and sensors and actuators external to the WEB via a set of three Flex cables. Although the boards are generally referred to as the "CPU" Board and the "Power" Board, 
they each contain components which are responsible for power generation, power conditioning, power distribution and control, 
analog and digital I/O control and processing, computing (i.e., the CPU), and data storage (i.e., memory)." -wikimedia description of the following photo:
<img width="943" height="750" alt="image" src="https://github.com/user-attachments/assets/1fd5512a-f4e7-4874-b908-c42b796ea836" />

The CPU is a flight-qualified Intel 8085 running at 100 KIPS. [Here is a JPL summary](https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/pathfinder/software-electronics/)

The 8085 CPU is from March 1976. It is an improvement on the 8080 CPU which was released in April 1974. Improvements include simplified power supply as well as a mostly internal clock circuit.
"The radiation hardened version of the 8085 has been in on-board instrument data processors for several NASA and ESA space physics missions in the 1990s and early 2000s, including CRRES, Polar, FAST, Cluster, HESSI, the Sojourner Mars Rover, and THEMIS." 
[Intel 8085 @ Wikipedia](https://en.wikipedia.org/wiki/Intel_8085)

 Though Pentium processors were available, the 8085 was chosen for reliability in the harsh environment and for it's relatively low power consumption (~3 watts typically).
 All software was written in C, except for a few time-critical or hardware-specific functions which were wrtiten in 8085 Assembly. 
 It was a single-threaded control loop using interrupts for exception conditions, since power was considered inadequate for a multitasking executive.

 The 8080/8085 processors had:
 
    8 bit word size
    2's complement arithmetic
    single level interrupt system
    registers separate from memory addresses
    no floating point processor instructions

Further the Sojourner rover Control and Navigation Subsystem had:

    100 Kips
    64 Kbyte memory address range split into 4 16 Kbyte banks
    11 banks of ROM
    36 banks of RAM
    I/O to about 70 sensor channels and services

"Unlike the executives for the Apollo AGC and the Viking GCSC or VxWorks used in later Power based spacecraft control systems, the core software in the Sojourner rover 8085 code did not use a 'time sharing' or multi-tasking executive. 
This was possible because the Sojourner rover Control and Navigation Subsystem didn't control time sensitive space navigation or landing which those other systems did. 
Instead the Sojourner rover 8085 code had a simple control loop that executed commands sequentially. ["Software Development and Processors for Hobbyists and Students of Robotics"](https://terakuhn.weebly.com/software.html)






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

