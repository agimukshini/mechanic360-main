# Generated migration to seed service catalog with common mechanic shop services

from django.db import migrations


def seed_services(apps, schema_editor):
    ServiceCatalogItem = apps.get_model("visits", "ServiceCatalogItem")

    services = [
        # Engine & Oil
        {"name": "Oil Change", "description": "Replace engine oil and oil filter. Includes checking fluid levels and visual inspection.", "default_duration_hours": 0.5, "default_price": 45.00},
        {"name": "Engine Tune-Up", "description": "Replace spark plugs, check ignition system, adjust timing, and test engine performance.", "default_duration_hours": 2.0, "default_price": 180.00},
        {"name": "Timing Belt Replacement", "description": "Replace timing belt and tensioners. Recommended per manufacturer interval.", "default_duration_hours": 4.0, "default_price": 450.00},
        {"name": "Coolant Flush", "description": "Drain and replace engine coolant. Inspect hoses and radiator.", "default_duration_hours": 1.0, "default_price": 85.00},
        {"name": "Thermostat Replacement", "description": "Replace engine thermostat and test cooling system.", "default_duration_hours": 1.5, "default_price": 120.00},
        {"name": "Water Pump Replacement", "description": "Replace water pump, gaskets, and refill coolant.", "default_duration_hours": 3.0, "default_price": 350.00},

        # Brakes
        {"name": "Brake Pad Replacement", "description": "Replace front or rear brake pads. Includes rotor inspection.", "default_duration_hours": 1.5, "default_price": 120.00},
        {"name": "Brake Rotor Resurfacing", "description": "Machine brake rotors to restore smooth surface.", "default_duration_hours": 1.0, "default_price": 80.00},
        {"name": "Full Brake Service", "description": "Replace pads, rotors, and inspect calipers. Includes brake fluid flush.", "default_duration_hours": 4.0, "default_price": 450.00},
        {"name": "Brake Fluid Flush", "description": "Replace all brake fluid and bleed brake lines.", "default_duration_hours": 1.0, "default_price": 95.00},
        {"name": "Brake Caliper Replacement", "description": "Replace faulty brake caliper and test braking system.", "default_duration_hours": 2.0, "default_price": 250.00},

        # Transmission
        {"name": "Transmission Fluid Change", "description": "Drain and replace transmission fluid. Inspect filter and pan.", "default_duration_hours": 1.5, "default_price": 150.00},
        {"name": "Transmission Flush", "description": "Complete transmission fluid exchange using flush machine.", "default_duration_hours": 2.0, "default_price": 220.00},
        {"name": "Clutch Replacement", "description": "Replace clutch disc, pressure plate, and release bearing.", "default_duration_hours": 6.0, "default_price": 800.00},
        {"name": "Transmission Repair", "description": "Diagnose and repair transmission issues. Price varies by repair scope.", "default_duration_hours": 8.0, "default_price": 600.00},

        # Tires & Wheels
        {"name": "Tire Rotation", "description": "Rotate tires to ensure even wear. Includes pressure check.", "default_duration_hours": 0.5, "default_price": 30.00},
        {"name": "Wheel Alignment", "description": "Adjust wheel angles to manufacturer specifications.", "default_duration_hours": 1.0, "default_price": 90.00},
        {"name": "Tire Replacement", "description": "Mount, balance, and install new tires.", "default_duration_hours": 1.0, "default_price": 40.00},
        {"name": "Flat Tire Repair", "description": "Patch or plug punctured tire. Includes balance check.", "default_duration_hours": 0.5, "default_price": 35.00},
        {"name": "Wheel Balancing", "description": "Balance wheels to eliminate vibration.", "default_duration_hours": 0.5, "default_price": 25.00},

        # Electrical & Battery
        {"name": "Battery Replacement", "description": "Test, remove old battery, and install new one. Register if required.", "default_duration_hours": 0.5, "default_price": 25.00},
        {"name": "Battery Diagnostic", "description": "Test battery health, alternator output, and parasitic drain.", "default_duration_hours": 0.5, "default_price": 40.00},
        {"name": "Alternator Replacement", "description": "Replace faulty alternator and test charging system.", "default_duration_hours": 2.0, "default_price": 280.00},
        {"name": "Starter Motor Replacement", "description": "Replace faulty starter motor and test starting system.", "default_duration_hours": 2.0, "default_price": 250.00},
        {"name": "Headlight Replacement", "description": "Replace burned-out headlight bulb or complete assembly.", "default_duration_hours": 0.5, "default_price": 45.00},

        # Suspension & Steering
        {"name": "Shock/Strut Replacement", "description": "Replace worn shock absorbers or struts. Includes alignment check.", "default_duration_hours": 3.0, "default_price": 400.00},
        {"name": "Power Steering Fluid Change", "description": "Flush and replace power steering fluid.", "default_duration_hours": 1.0, "default_price": 75.00},
        {"name": "Power Steering Pump Replacement", "description": "Replace faulty power steering pump and refill fluid.", "default_duration_hours": 3.0, "default_price": 380.00},
        {"name": "Control Arm Replacement", "description": "Replace worn control arms and bushings.", "default_duration_hours": 2.5, "default_price": 300.00},
        {"name": "Wheel Bearing Replacement", "description": "Replace worn wheel bearing and hub assembly.", "default_duration_hours": 2.0, "default_price": 250.00},

        # Exhaust & Emissions
        {"name": "Muffler Replacement", "description": "Replace damaged or corroded muffler.", "default_duration_hours": 1.5, "default_price": 200.00},
        {"name": "Catalytic Converter Replacement", "description": "Replace faulty catalytic converter. Includes emissions test.", "default_duration_hours": 2.5, "default_price": 500.00},
        {"name": "Oxygen Sensor Replacement", "description": "Replace faulty O2 sensor and clear error codes.", "default_duration_hours": 1.0, "default_price": 120.00},
        {"name": "Emissions Test", "description": "Complete emissions system inspection and testing.", "default_duration_hours": 0.5, "default_price": 50.00},

        # HVAC
        {"name": "AC Recharge", "description": "Check AC system pressure, add refrigerant, and test cooling.", "default_duration_hours": 1.0, "default_price": 80.00},
        {"name": "AC Compressor Replacement", "description": "Replace AC compressor, flush lines, and recharge system.", "default_duration_hours": 4.0, "default_price": 550.00},
        {"name": "Heater Core Replacement", "description": "Replace faulty heater core and refill coolant.", "default_duration_hours": 5.0, "default_price": 450.00},
        {"name": "Cabin Air Filter Replacement", "description": "Replace cabin air filter for better air quality.", "default_duration_hours": 0.25, "default_price": 20.00},

        # Diagnostics & Inspections
        {"name": "Check Engine Light Diagnostic", "description": "Read OBD-II codes, diagnose issue, and provide repair estimate.", "default_duration_hours": 1.0, "default_price": 75.00},
        {"name": "360° Vehicle Inspection", "description": "Comprehensive multi-point inspection covering brakes, tires, fluids, belts, and safety systems.", "default_duration_hours": 1.5, "default_price": 50.00},
        {"name": "Pre-Purchase Inspection", "description": "Detailed inspection for used vehicle buyers. Covers mechanical, electrical, and body condition.", "default_duration_hours": 2.0, "default_price": 120.00},
        {"name": "General Diagnostic", "description": "General vehicle diagnostic covering all systems. Includes test drive.", "default_duration_hours": 1.5, "default_price": 90.00},

        # Filters & Fluids
        {"name": "Air Filter Replacement", "description": "Replace engine air filter for optimal performance.", "default_duration_hours": 0.25, "default_price": 15.00},
        {"name": "Fuel Filter Replacement", "description": "Replace fuel filter to maintain fuel system health.", "default_duration_hours": 0.5, "default_price": 40.00},
        {"name": "Power Steering Fluid Change", "description": "Flush and replace power steering fluid.", "default_duration_hours": 1.0, "default_price": 75.00},
        {"name": "Differential Fluid Change", "description": "Drain and replace differential gear oil.", "default_duration_hours": 1.0, "default_price": 80.00},
        {"name": "Transfer Case Fluid Change", "description": "Replace transfer case fluid for 4WD/AWD vehicles.", "default_duration_hours": 1.0, "default_price": 75.00},

        # Belts & Hoses
        {"name": "Serpentine Belt Replacement", "description": "Replace serpentine/accessory drive belt and tensioner.", "default_duration_hours": 1.0, "default_price": 100.00},
        {"name": "Radiator Hose Replacement", "description": "Replace cracked or leaking radiator hoses.", "default_duration_hours": 1.0, "default_price": 80.00},
        {"name": "Radiator Replacement", "description": "Replace damaged or leaking radiator and refill coolant.", "default_duration_hours": 3.0, "default_price": 350.00},

        # Body & Exterior
        {"name": "Windshield Wiper Replacement", "description": "Replace front and rear windshield wiper blades.", "default_duration_hours": 0.25, "default_price": 15.00},
        {"name": "Headlight Restoration", "description": "Sand and polish cloudy/foggy headlights for clarity.", "default_duration_hours": 1.0, "default_price": 60.00},
        {"name": "Side Mirror Replacement", "description": "Replace damaged side view mirror assembly.", "default_duration_hours": 1.0, "default_price": 150.00},
    ]

    for service in services:
        ServiceCatalogItem.objects.create(**service)


def remove_services(apps, schema_editor):
    ServiceCatalogItem = apps.get_model("visits", "ServiceCatalogItem")
    ServiceCatalogItem.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("visits", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_services, remove_services),
    ]
