document.addEventListener("DOMContentLoaded", () => {
    // Number Counter Animation
    const counters = document.querySelectorAll('.count');
    const speed = 100; // The lower the slower

    const animateCounters = () => {
        counters.forEach(counter => {
            const target = +counter.getAttribute('data-target');
            const inc = target / speed;
            
            let count = 0;
            const updateCount = () => {
                count += inc;
                
                if (count < target) {
                    // Format number with commas
                    counter.innerText = Math.ceil(count).toLocaleString();
                    requestAnimationFrame(updateCount);
                } else {
                    counter.innerText = target.toLocaleString() + "+";
                }
            };

            // Setup Intersection Observer to animate only when visible
            const observer = new IntersectionObserver((entries) => {
                if(entries[0].isIntersecting) {
                    updateCount();
                    observer.disconnect(); // Animate only once
                }
            }, { threshold: 0.5 });

            observer.observe(counter);
        });
    };

    animateCounters();
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Image/Screenshot Placeholder click handler
    const placeholders = document.querySelectorAll('.reel-placeholder');
    placeholders.forEach(placeholder => {
        placeholder.addEventListener('click', () => {
            alert("In a real app, this would open a file picker to insert the Reels screenshot for this brand. For now, you can edit the HTML to replace this with an <img> tag!");
        });
    });
});
