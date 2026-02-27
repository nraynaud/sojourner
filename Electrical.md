# Notes on the electrical design of the Sojourner rover

Christopher Bovee, January 2026

As a spaceflight nerd and robiticist I am fascinated with the electronics and control systems of the Sojourner Rover.
This document is meant to outline the electrical components & software, and how they functioned together to operate the rover. 



The pathfinder mission was designed under heavy budget constraints relative to previous missions, which pushed engineers to develop new ways of doing things.
Moreso than previous missions, a large amount of the hardware is made from what was available "commercial off the shelf", with as little modification as possible.




## Main computer:

From Wikipedia:
"The 'brain' of the MFEX Microrover (Sojourner) is comprised of two electronics boards interconnected to one another, the sensors within the WEB (Warm Electronics Box), 
and sensors and actuators external to the WEB via a set of three Flex cables. 

Although the boards are generally referred to as the "CPU" Board and the "Power" Board, 
they each contain components which are responsible for power generation, power conditioning, power distribution and control, 
analog and digital I/O control and processing, computing, and data storage."

<img width="943" height="750" alt="image" src="https://github.com/user-attachments/assets/1fd5512a-f4e7-4874-b908-c42b796ea836" />





### Processor:

The CPU is a flight-qualified CMOS Intel 8085 running at 100 KIPS. [Here is a JPL summary](https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/pathfinder/software-electronics/)

The 8085 microprocessor was released in March 1976. It is an improved form of 8080 CPU, which was released in April 1974. The differences include simplified power and clock requirements. By 1994, the 8085 was a mature, reliable, well-understood and space-proven processor. "The radiation hardened version of the 8085 has been in on-board instrument data processors for several NASA and ESA space physics missions in the 1990s and early 2000s, including CRRES, Polar, FAST, Cluster, HESSI, the Sojourner Mars Rover, and THEMIS." 
[Intel 8085 @ Wikipedia](https://en.wikipedia.org/wiki/Intel_8085)


Though Pentium processors were available, the 8085 was chosen for reliability in the harsh environment and for it's relatively low power consumption. The Intel 80C85 itself, at the 2 MHz speed used on Sojourner, draws ~50 mW (0.05 watts) while running and only 10% of that in it's sleep or halt state. The other components, RAM, ROM, the clock, etc drew much more power. one document cites "CPU operation" as being 3.7W on average, including everything. 






Specs of the computer system included:

    100,000 instructions per second @ 2 MHz clock speed,
    64 Kb memory address range split into 4 16 Kb banks of system RAM,
    11 banks of ROM, 
    36 banks of extended RAM,
    I/O to about 90 sensor channels and services
    8-bit word size
    2's complement arithmetic and no floating point instructions
    single-level interrupt system
    registers separate from memory addresses



### Memory:

The computer could access much more than 64Kb of memory using bank switching.

	64 KB Main RAM (IBM): Used as the working memory for the processor to execute the flight software.
	16 KB PROM (Harris): Contained the permanent, radiation-hardened bootloader and basic hardware initialization code.
	176 KB EEPROM (Seeq Tech): Housed the full suite of flight software, which included the cyclic executive, navigation behaviors, and communication protocols.
	512 KB Temporary RAM (Micron): Dedicated primarily to data storage, such as buffering camera images and telemetry data before transmission.

<img width="1116" height="258" alt="7-Table3-1" src="https://github.com/user-attachments/assets/c3a80915-8929-4436-81ee-16f2582854be" />





Some unverified but likely component types from various sources:

	Somewhere on this board is apparently Intel 8255, 8251, and 8253 chips. 
	It has at least one 8-bit ADC that is multiplexed somehow, and op amps. 

	Apparently it also uses 54 and 74 series chips for bus activities:
	(5400 are military grade but fully compatible versions of the common 7400 series TTL logic chips)

	54LS138 address decoder, 54LS373 Bus latch, 54LS244/245 Bus buffer,	54LS00/08 NAND/AND gates,
	
	LM117, LM105, LM723, Voltage regulators plus other DC to DC converters.



I will begin identifying the component groupings on the boards as I am able to. 





From Ken Shirriff: 
"I expect that the chips are mostly military versions, and then covered in shiny conformal coating. 
The socketed chip on the right board is probably the 80C85. 
The gold square chip to the upper right looks like it might have an IBM logo if I squint. 
The two rows of gold chips are probably the memory.
There are 8 unfilled positions on the right that probably are for expansion memory.
The board on the left looks like it has transformers and inductors, so that's probably the power supply."





## Software:
 
 All software was written in C, except for a few time-critical or hardware-specific functions which were wrtiten in 8085 Assembly.
 A Unix development environment was used.
 
 "Sojourner's sophisticated software was written in C and assembly using a Unix development environment; it runs on an Intel 80C85 processor operating at 2MHz, a choice dictated by power and radiation-hardness constraints. Sojourner's top speed is roughly 1 cm/sec. It was a single-threaded control loop using interrupts for exception conditions, since power was considered inadequate for a multitasking executive."

"Unlike the executives for the Apollo AGC and the Viking GCSC or VxWorks (RTOS) used in later PowerPC based spacecraft control systems, the core software in the Sojourner rover 8085 code did not use a 'time sharing' or multi-tasking executive. 
This was possible because the Sojourner rover Control and Navigation Subsystem didn't control time sensitive space navigation or landing which those other systems did. 
Instead the Sojourner rover 8085 code had a simple control loop that executed commands sequentially. ["Software Development and Processors for Hobbyists and Students of Robotics"](https://terakuhn.weebly.com/software.html)


### Autonomous navigation and the Light-stripe system


"The Sojourner rover features limited autonomous navigation ability, encapsulated primarily in the 'Go To Waypoint' command: ground operators specify a goal location, and the rover moves toward the goal without further instruction, avoiding obstacles and other hazards on its own. The rover captures stereo image data with its front-mounted stereo camera pair, which it also uses to perceive its environment via a laser-striping system. 

This system senses obstacles ahead of the rover as follows: the five on-board lasers project stripes onto the ground, and selected lines in each camera are scanned to build up a 20-point range 'image' of the terrain immediately in front of the rover. 
This terrain model is then used on-board, during execution of the 'Go To Waypoint' command, to perform hazard detection and avoidance on the way to the goal."

The weak light of the lasers was detected during the martian daytime by using the cameras to take two pictures rapidly: one with lasers turned on and one without. One image was subtracted from the other to get the difference, which is an image of only the laser lines.
The vertical displacement of the lines indicates the relative height of the surface or object in front of the rover.

[MFEX performance document](https://www.semanticscholar.org/paper/Sojourner%3A-The-Mars-Pathfinder-Microrover-Flight-Matijevic/809eac1b3631634371ea68eef4b8778ad4235ae9)
<img width="1226" height="154" alt="7-Table4-1" src="https://github.com/user-attachments/assets/08608ddc-6f9e-40c9-98d0-bf1cf02862aa" />


## Sensor suite

<img width="857" height="955" alt="image" src="https://github.com/user-attachments/assets/1e770c14-037b-4ebd-92da-c8859e52fe84" />


## Radio Systems:

[Microrover telecom overview](http://www.iki.rssi.ru/mpfmirror/rovercom/radio.html) 
[Microrover telecom subsystem 'lessons learned'](https://www.academia.edu/122637267/Mars_Microrover_Telecom_Subsystem)

The components of the telecommunications system are:

The Sojourner Rover UHF radio modem and antenna,
The lander LMRE (Lander Mounted Rover Equipment) UHF Radio Modem and antenna,
The lander's own - X‑band transmitter and receiver for direct‑to‑Earth communication.


"Sojourner communicated with its base station using a 9,600 baud radio modem, although error-checking protocols limited communications to a functional data rate of 2,400 baud with a theoretical range of about half a kilometer. Under normal operation, it would periodically send a "heartbeat" message to the lander. If no response was given, the rover could autonomously travel back to the location at which the last heartbeat was received. If desired, this same strategy could be used to deliberately extend the rover's operational range beyond that of its radio transceiver, although the rover rarely traveled further than 10 meters from Pathfinder during its mission."


"The Microrover radio is located inside the Rover WEB (Warm Electronics Box) where it is protected from the extreme cold. The radio is connected to the Microrover antenna using a short piece of coaxial cable that passes through the wall of the WEB. 
The radios that are used in the Microrover telecommunications system were purchased from Motorola's Paging Products Division. Several components that were designed and used in these radios were made by a company named DataRadio. These are off-the-shelf commercial radio modems (modulator+demodulator) that were modified to meet the communication needs of the Microrover mission. The antennas were designed and built by our Telecom team here at JPL."

"The repackaging philosophy we selected to follow was, to keep the radios as close to their original forms as possible, replacing and adding only the necessary items. To be specific, we wanted to make sure that the electrical performance of the radios is not altered. But we did want to make certain that these radios will withstand thermal cycles, shock & vibration conditions. After much discussion, we came up with the following plan: replace all plastic connectors and switch with soldered-in wire jumpers; replace fuse with a jumper wire; pot or stake down all variable components; mount the radio boards on JPL built stainless steel frames; add heaters and temperature sensors; replace commercial grade RF connector with more reliable SMA connectors; wrap the assembly with fiber glass - Aluminum tape - fiber glass sandwich cover, replacing the heavier commercial metal casing, for weight reduction."


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






## Bumper strips:

There is also a wide physical bumper on each side of the rover, connected by flat springs and off-the-shelf contact switches [Honeywell MH](https://www.mouser.fr/c/electromechanical/switches/basic-snap-action-switches/?m=Honeywell&series=HM)

These contact switches trigger an 'interrupt' on the 8085 processor, since it is running a single threaded program and wants to react immediately when a bumper is pressed, rather than the next time it gets around to polling that input.



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




## Power Systems:


"A solar panel and primary batteries supplied Rover power. The Rover solar panel surface area of approximately 2200cm^2 was composed of 13 diode-Isolated strings of 18 GaAs/Ge cells, 5.5 mil thick, 2x4 cm per cell, with 3-mil cover glasses. Peak power was 15.3 W maximum at noontime at approximately 15.5 V. 

The remaining part of the power subsystem consisted of three strings of lithium-thionyl chloride primary (non- rechargeable) battery cells and various DC/DC converters, switching regulators, and inverters to provide necessary voltage levels. The lithium battery pack was designed to provide approximately 150W-hrs of energy at 50% depth of discharge- The batteries were entirely consumed during the mission."

Great care was taken to be frugal with the electrical power available. The batteries were not rechargable, and only meant to supplement the system when solar alone was inadequate, and to run the heater inside if temperatures got too low, particularly at night.


### Some low power considerations:

	Interior electrical heaters were aided by 3 )
	
	Image capture, computing tasks, radio transmissions, driving, etc are performed at different times to keep power draw as low as possible and prevent needing the batteries.
	
	The rover went into sleep mode at night to conserve battery.
	
The solar panel fed the "regulated electronics bus", which powered the CPU, radio, motor drivers, sensors, etc. Inside were two resistive heaters, on the battery and the radio modem.



<img width="1072" height="444" alt="4-Table1-1" src="https://github.com/user-attachments/assets/ea777c38-625c-4093-93c5-4d376e2278eb" />


info gleamed from (https://web.archive.org/web/20160118204241/http://mars.jpl.nasa.gov/MPF/roverpwr/power.html):




Solar Array Technical Information:
	
	Type			Gallium Arsenide on Germanium (GaAs/Ge)		
	Size			2 x 4 cm, 5.5 mil thick		
	Coverglass		3 mil, CMG		
	Efficiency		>18% efficiency

	Configuration		  13 parallel strings, 18 series cells per string		
	Power              16.5 watts on Mars at noon								
				         45 watts  1 sun/AMO (Earth)		
	Operating Voltage	  14-18 volts		
	Substrate          Nomex honeycomb				
	Weight             0.340 kg		
	Size               0.22 m2		
	Survival Temp		-140 to +110 C
	
Solar Array Contractor: Applied Solar Energy Corporation (ASEC), City of Industry, CA


Battery Technical Information:
	
	Chemistry		Lithium-Thionyl Chloride (Li-SOCl2)		
	Size			D-Size		
	Weight			118 grams
	Capacity		+25C		12 amp-hrs						
                 -20C		8 amp-hrs
		
	# of batteries:    3		
	Cells per battery:	  3 cells in series		
	Size               40 mm dia, 186 mm length		
	Weight             1.24 kg		
	Operating voltage	  8 - 11 volts
	
Cell Contractor: SAFT America, Cockeysville, MD

 
Power Electronics Technical Information:
Distribution Architecture : "Single string w/graceful degradation" (meaning PV panels are diode isolated in the case of failure)

	Main bus		8 to 18 volts		
	Secondary		+/-12v, 9v, +/-7.5v, 5v, +/-5v, 3.3v
	
Power Electronics Suppliers: Pico Electronics, Power Trends, Nation Semiconductor, Motorola, Semtech	




Enabling the CPU takes power consumption from 0.2A to 0.5A. CPU time is cited as costing 3.7 watts on average. 

<img width="952" height="840" alt="image" src="https://github.com/user-attachments/assets/ea5f975e-691f-4b8e-bda4-ebf07b4f08ee" />




## Thermal control systems:

As Don Bickler stated when discussing the design of the rover, "The thermal world is a big one". There are complications with external wiring between multiple insulated sections for electronics to function. hence, all electronics except for exterior motors and sensors were mounted inside the WEB (Warm Electronics Box) which is well insulated by a thick layer of aerogel on all sides. The WEB contains 2 electrical heaters and thermostats so that the rover may regulate itself. It apparently contained 4 thermostats based on one drawing (WEB 1993-02)

Additionally, 3 Radioisotope heaters (RHUs) were employed to relieve the electrical heaters by each continuously supplying 1 watt of thermal power, each a 40-gram canister of a plutonium-238 pellet.

[Interview with Sabah Bux:](https://www.nasa.gov/podcasts/on-a-mission/the-power-of-the-rovers-s4e10/)

"While the microwave-oven-sized Sojourner and the golf-cart-sized Spirit and Opportunity rovers were mainly solar-powered, they also had a nuclear power source, that defended them against the frigid Martian cold. Sojourner and Spirit and Opportunity, they all had RHUs, Radioisotope Heater Units. And what they are is a little piece of plutonium to keep them warm in the cold expanse of Mars, like a little hand warmer. These plutonium hand warmers were each smaller than a pencil eraser, but they were big power savers for those missions. Rather than use up energy running many heaters, the rover’s precious electrical power could be used for other activities instead, like driving around and taking pictures to send back to Earth."

In addition to simple low-temperature thermostats, the computer monitored the temperatures of critical areas via many analog temperature sensors. 

<img width="744" height="344" alt="5-Table2-1" src="https://github.com/user-attachments/assets/8d3fd2ed-77bf-4c46-b708-4254e8859663" />




## Motion control systems:

All 6 rover wheels are powered by Maxon RE163 or (RE016) Brushed DC motors which operate at 6 volts. A simple motor-mounted encoder is able to count the motor rotations in order to measure the distance driven.
"Vehicle motion control is accomplished through the on/off switching of drive or steering motors. An average of motor encoder (or potentiometer) readings is used for odemetry.

Motors: Maxon RE163 (sometimes "RE016") with single output shaft. [This document details what modifications were required for the motors to survive the low pressure environment.](https://www.esmats.eu/amspapers/pastpapers/pdfs/2012/phillips.pdf)

Potentiometers: [BI precision 61735 utilizing a "conductive plastic" element material](https://www.ttelectronics.com/products/passive-components/potentiometers/6173) 4 of these are used for steering position feedback.

[here is an interesting vintage site covering some development aspects and technical points.](http://www.iki.rssi.ru/mpfmirror/rovercom/rovintro.html)




## Inertial Measurement Sensors

Sojourner is fitted with a vertical-axis rate gyro and 3 single-axis accelerometers. 

The rate gyro is a 'Quartz Rate Sensor' part number QRS11. It is a solid-state sensor developed by BEI Technologies (now part of Schneider Electric). 
It uses a micromachined vibrating quartz tuning fork and the Coriolis effect.

[QRS11 Datasheet](https://d1io3yog0oux5.cloudfront.net/_858e8c31e3bd4e429880b218547fee08/emcore/db/784/8448/datasheet/964001_T1_QRS11.pdf)

"The BEI GyroChip used in the Mars rover Sojourner was the first micromachined technology to operate on the Martian surface. 
[Coriolis theory of operation:](https://www.fiercesensors.com/components/a-micromachined-quartz-angular-rate-sensor-for-automotive-and-advanced-inertial)

The QRS was also cost-reduced for automotive applications and called the "GyroChip II".

<img width="1114" height="818" alt="image" src="https://github.com/user-attachments/assets/60c0d71c-3d2b-40d9-a240-5712843e6989" />

The three accelerometers were also solid state piezo-based devices. still searching for a model number. by the drawings they are seemingly cylindrical or square units, about 27mmx36mm in profile.


## Rover Control Workstation (RCW)

[old jpl website mentioning the RCW]https://web.archive.org/web/20160118204358/http://mars.jpl.nasa.gov/MPF/roverctrlnav/rcw.html

The RCW is the computer system used on earth to assess the rover's status, position, and to generate and send commands the operate the rover. It was based on an SGI Onyx 2 computer.

one document mentions "The ground operators' interface software as being Silicon Graphics Inventor®-based"
[Mars Rovers: July 4, 1997, and Beyond by Sharon Laubach](https://dl.acm.org/doi/pdf/10.1145/332084.332086#k%u01603%E9%3Dn5Y%u2022Q%CAs%5C%07%13%26%u0131MPF_homepage)
Inventor is a 3D graphics library from the time, used to write 3D applications for SGI hardware. 
[read more about SGI inventor here](https://web.cs.wpi.edu/~matt/courses/cs563/talks/inventor.html)



![rcw](https://github.com/user-attachments/assets/bcf0c033-b9b9-425b-aec4-973588ef344b)


The rover as well as the lander had stereo pairs of cameras capable of taking stereographic 3D images.

"The uplink engineers spent several hours laboriously building and documenting the command sequences, using the Rover Control Workstation (an SGI Onyx 2). A typical sequence contained 200-300 commands, detailing everything from thermal control parameters, to health status check rates, to actual instrument operation and traverse instructions. The traverse commands, in particular, necessitated an intensive building process: the designated ``rover driver'' donned LCD shuttered goggles in order to scrutinise a 3D display of actual Martian terrain derived from stereo data from the IMP cameras."

Stereo imagery from the IMP was projected to it's real distance and location in the virtual environment using photogrammetry techniques. Then, operators could look from different points of view, plan around the terrain, and determine waypoint positions.


<img width="407" height="287" alt="image" src="https://github.com/user-attachments/assets/b26b18fa-13e2-4533-a9c4-e806f113ecb7" />



there was an LCD-based 3D glasses solution for SGI called CrystalEyes from StereoGraphics, which was utilized to view the environment in 3D.

<img width="1600" height="1066" alt="image" src="https://github.com/user-attachments/assets/c3f2ef42-53cf-481e-83fb-014d6a5f5284" />



Brian K. Cooper using the CrystalEyes:

<img width="728" height="578" alt="image" src="https://github.com/user-attachments/assets/26692717-3db5-4e86-8d9e-3554e3a0dc8c" />




## This file is a work in progress. 

To be discussed further is power management, 
thermal control scheme and the WEB, 
Motor controller hardware, 
complete IMU section (identify accelerometer type)
connectors, wires, 
and other experiments' electrical considerations,
and citing the archive docs properly

