# Notes on the electrical design of the Sojourner rover
Christopher Bovee, January 2026


As a spaceflight nerd and robiticist I am fascinated with the electronics and control systems of the Sojourner Rover.
The pathfinder mission was designed under heavy budget constraints which pushed engineers to develop new ways of doing things.
Moreso than previous missions, a large amount of the hardware is made from what was available commercially "off the shelf".
This document is meant to outline the electrical components & software, and how they functioned together to operate the rover. 





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
 All software was written in C, except for a few time-critical or hardware-specific functions which were wrtiten in 8085 Assembly. "Sojourner's sophisticated software was written in C and assembly using a Unix development environment 
 (note: Sojourner has no on-board operating system); it runs on an Intel 80C85 processor operating at 2MHz, a choice dictated by power and radiation-hardness constraints.  Sojourner's top speed is roughly 1 cm/sec"
 It was a single-threaded control loop using interrupts for exception conditions, since power was considered inadequate for a multitasking executive.

 The 8080/8085 processors had:
 
    100 Kips - 2 MHz clock
    64 Kbyte memory address range split into 4 16 Kbyte banks
    11 banks of ROM
    36 banks of RAM
    I/O to about 70 sensor channels and services
    8 bit word size
    2's complement arithmetic
    single level interrupt system
    registers separate from memory addresses
    no floating point processor instructions

"Unlike the executives for the Apollo AGC and the Viking GCSC or VxWorks (RTOS) used in later PowerPC based spacecraft control systems, the core software in the Sojourner rover 8085 code did not use a 'time sharing' or multi-tasking executive. 
This was possible because the Sojourner rover Control and Navigation Subsystem didn't control time sensitive space navigation or landing which those other systems did. 
Instead the Sojourner rover 8085 code had a simple control loop that executed commands sequentially. ["Software Development and Processors for Hobbyists and Students of Robotics"](https://terakuhn.weebly.com/software.html)



## Radio systems

[Microrover telecom overview](http://www.iki.rssi.ru/mpfmirror/rovercom/radio.html) 
[Microrover telecom subsystem 'lessons learned'](https://www.academia.edu/122637267/Mars_Microrover_Telecom_Subsystem)

The components of the telecommunications system are:

The Sojourner Rover UHF radio modem and antenna,
The lander LMRE (Lander Mounted Rover Equipment) UHF Radio Modem and antenna,
The lander's own - X‑band transmitter and receiver for direct‑to‑Earth communication.

"The Microrover radio is located inside the Rover WEB (Warm Electronics Box) where it is protected from the extreme cold. The radio is connected to the Microrover antenna using a short piece of coaxial cable that passes through the wall of the WEB. 
The radios that are used in the Microrover telecommunications system were purchased from Motorola's Paging Products Division. Several components that were designed and used in these radios were made by a company named DataRadio. 
These are off-the-shelf commercial radio modem's (modulator+demodulator) that were modified to meet the communication needs of the Microrover mission. The antennas were designed and built by our Telecom team here at JPL."

"The repackaging philosophy we selected to follow was, to keep the radios as C1OSC to their original forms as possible, replacing and adding only the necessary items. 
To be specific, we wanted to make sure that the electrical performance of the radios is not altered. But we did want to make certain that these radios will withstand thermal cycles, shock & vibration conditions. 
After much discussion, we came up with the following plan: replace all plastic connectors and switch with soldered-in wire jumpers; replace fuse with a jumper wire; pot or stake down all variable components; 
mount the radio boards on JPL built stainless steel frames; add heaters and temperature sensors; replace commercial grade RF connector with more reliable SMA connectors; 
wrap the assembly with fiber glass - Aluminum tape - fiber glass sandwich cover, replacing the heavier commercial metal casing, for weight reduction."


Flight Rover Radio Modem:
<img width="616" height="417" alt="image" src="https://github.com/user-attachments/assets/5208aa1c-15fb-430b-9ba6-3bcb16889f64" />

<img width="620" height="359" alt="image" src="https://github.com/user-attachments/assets/0a35d961-41b0-4aa3-aa09-b21d74524222" />


### UHF radio modem Specifications:

Type: Modified Motorola RNET 9600 Radio Modem [still available as surplus](https://bmisurplus.com/products/motorola-rnet-450s-data-transceiver/)
Mass: 105.9 grams
Dimensions: 8.13 cm (3.2") length by 6.35 cm (2.5") width by 2.3 cm (0.9") height
RF Connector Type: Coaxial SMA
DC Connector Type: 9 pin Micro-D (signal and power)
DC Bus Voltage: +9 Volts, Regulated
DC Bus Current: 28 mA Standby; 35 mA Receive; 170 mA Transmit
Operating Voltage: +7.5 Volts
DC Power: 1.7 W (includes +9V regulator efficiency)
RF Center Frequency: 459.7 MHz
RF Channel Bandwidth: 25 KHz
RF Signal Modulation: DGMSK (Differential Gaussian Minimum Shift Keying), basically FM modulation
RF Transmit Power: 100 mW
Computer Interface: RS232 converted to TTL levels
Maximum Data Rate: 9600 BPS (Bits Per Second) Asynchronous; Effective :2400 BPS
Temperature Range: -30C to +40C (operational), -55C to +60C (storage)
Handshaking: Half Duplex (Simplex)



### Rover Antenna Specifications

Overall Length: 45.0 cm (includes support tube)
Materials: Fiberglass tube, Aluminum Tube, Teflon supports, coaxial cable
RF Connector Type: Coaxial SMA
RF Center Frequency: 459.7 MHz
RF Bandwidth: 700 KHz for < 2:1 VSWR
RF Gain: 1.4 dBiv
Free Space Match: 1.09:1 VSWR at center frequency 
The height of the rover antenna when it is deployed is about 83 cm.

-these specs according to this site [How the MARS microrover radios and antennas work](http://www.iki.rssi.ru/mpfmirror/rovercom/itworks.html)



## Light-stripe system for autonomous navigation


"The Sojourner rover features limited autonomous navigation ability, encapsulated primarily in the 'Go To Waypoint' command: ground operators specify a goal location, and the rover moves toward the goal without
further instruction, avoiding obstacles and other hazards on its own. The rover captures stereo image data with its front-mounted stereo camera pair, which it also uses to perceive its environment via a laser-striping system. 
This system senses obstacles ahead of the rover as follows: the five on-board lasers project stripes onto the ground, and selected lines in each camera are scanned to build up a 20-point range 'image' of the terrain immediately in front of the rover. 
This terrain model is then used on-board, during execution of the 'Go To Waypoint' command, to perform hazard detection and avoidance on the way to the goal. 

The weak light of the lasers was detected using the cameras to take two pictures rapidly: one with lasers turned on and one without. 
The lights-off image was subtracted from the lights-on image to detect the faint laser light. 
The vertical displacement of the light indicates the relative height of the surface or object in front of the rover. 





## Bumper strips:

There is also a wide physical bumper on each side of the rover, connected by flat springs and off-the-shelf contact switches [Honeywell MH](https://www.mouser.fr/c/electromechanical/switches/basic-snap-action-switches/?m=Honeywell&series=HM)




## Rover Control Workstation (RCW)

The RCW is the computer system used on earth to assess the rover's status, position, and to generate and send commands the operate the rover. It was based on an SGI Onyx 2 computer.

one document mentions "The ground operators' interface software is Silicon Graphics Inventor®-based" [Mars Rovers: July 4, 1997, and Beyond by Sharon Laubach](https://dl.acm.org/doi/pdf/10.1145/332084.332086#k%u01603%E9%3Dn5Y%u2022Q%CAs%5C%07%13%26%u0131MPF_homepage)
Inventor is a 3D graphics library for writing 3D applications like this. [read more about SGI inventor here](https://web.cs.wpi.edu/~matt/courses/cs563/talks/inventor.html)

![rcw](https://github.com/user-attachments/assets/bcf0c033-b9b9-425b-aec4-973588ef344b)

"The uplink engineers spent several hours laboriously building and documenting the command sequences, using the Rover Control Workstation (an SGI Onyx 2). 
A typical sequence contained 200-300 commands, detailing everything from thermal control parameters, to health status check rates, to actual instrument operation and traverse instructions. 
The traverse commands, in particular, necessitated an intensive building process: the designated ``rover driver'' donned LCD shuttered goggles in order to scrutinise a 3D display of actual Martian terrain derived from stereo data from theIMP cameras.



## Materials Adherence Experiment (MAE)

The MAE is installed in the front left corner cutout of Sojourner's solar panel. Marie Curie lacks this experiment.

"The purpose of this instrument was to make a measurement by which degradation of the array output due to dust coverage could be reliably separated from degradation due to other causes or changes in output due to variations in the solar intensity at the surface.
The MAE has two instruments: a quartz crystal microbalance, and a shorted GaAs solar cell fitted with a removable cover glass. (It also includes a temperature sensor and an open-circuit solar cell used to monitor the solar-array maximum-power point.)
The MAE solar cell experiment uses the GaAs solar cell with a removable cover glass to measure optical obscuration caused by settling dust. 
During the course of the mission, the cover glass on the shorted cell is occasionally rotated away from its normal position in front of the solar cell, and the short circuit current (Isc) is measured. 
Comparing Isc with and without the cover glass in place measures the optical obscuration of the glass surface by dust on the cover, plus the reflectance of thecover glass itself. 
The known reflectance of the coverglass is then subtracted out, to give the amount of obscuration due to dust." [Dust on Mars](https://github.com/user-attachments/files/25053947/dustonmars.pdf)



![MAE_Integration_Model](https://github.com/user-attachments/assets/299c6a7d-684c-4d94-a917-36554367f42e) 

This blurb about the function of the MAE quartz microbalance comes from an EE who designed the board which evaluates the MAE:

"The sensor outputted a sine wave (-ish), the frequency of which was the difference frequency between two crystals in an oscillator/mixer circuit. 
One crystal was shielded from the dusty atmosphere, the other, coated with vacuum grease (as glue) was exposed. Dust falling onto the exposed crystal became fixed and effectively changed its mass. 
Thus, the difference frequency was proportional to the mass difference between the two crystals and a direct function of accumulated dust mass. 
The sensor output was squared up by a comparator whose output went to the counter input of the micro. So we directly measured frequency. This board was within the WEB.

<img width="1504" height="2016" alt="image" src="https://github.com/user-attachments/assets/15965645-6938-4bef-8d79-0e00e6b98eaf" />









### Commercial Off The Shelf parts:

Motors: Maxon RE163 (sometimes "RE016") with single output shaft. [This document details what modifications were required for the motors to survive the low pressure environment.](https://www.esmats.eu/amspapers/pastpapers/pdfs/2012/phillips.pdf)

Potentiometers: [BI precision 61735 utilizing a "conductive plastic" element material](https://www.ttelectronics.com/products/passive-components/potentiometers/6173) 4 of these are used for steering position feedback.

'Bumper' contact switches are 



## This file is a work in progress. To be discussed is the power management and lifetime, thermal management and the WEB, Motor controller hardware, Intertial measurement sensors, connectors and wires, and other experiments' electrical considerations such as the APXS.

[here is an interesting vintage site covering some development aspects and technical points.](http://www.iki.rssi.ru/mpfmirror/rovercom/rovintro.html)


