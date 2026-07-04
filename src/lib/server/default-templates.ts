import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

// Default workflow templates seeded into every admin as their own editable copies
// (see templates-builder-plan). This constant is the SINGLE SOURCE OF TRUTH,
// transcribed from `reference/*.md`. Editing an admin's copy later never touches
// this; new admins get a fresh copy on signup. All items default to `not_started`,
// all milestone weights default to 1 (equal), descriptions come straight from source.

type DefaultItem = { title: string; description: string };
type DefaultMilestone = { name: string; items: DefaultItem[] };
type DefaultTemplate = {
	name: string;
	icon: string;
	description?: string;
	milestones: DefaultMilestone[];
};

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
	{
		name: 'eCommerce Website',
		icon: 'ri-shopping-cart-2-line',
		milestones: [
			{
				name: 'Planning',
				items: [
					{
						title: 'Project Requirements Review',
						description:
							'I will review the agreed project requirements to ensure every feature and deliverable is clearly understood before work begins.'
					},
					{
						title: 'Reference Materials Analysis',
						description:
							"I will analyze the provided reference websites, design inspirations, and supporting documents to establish the project's direction."
					},
					{
						title: 'Project Scope Confirmation',
						description:
							'I will verify the confirmed scope of work and identify any remaining assumptions before moving into execution.'
					},
					{
						title: 'Website Structure Planning',
						description:
							'I will plan the website structure, page hierarchy, and overall navigation based on the approved requirements.'
					},
					{
						title: 'Content Planning',
						description:
							'I will organize the provided content and determine how text, images, and other assets will be used throughout the website.'
					},
					{
						title: 'Product Catalog Planning',
						description:
							'I will review the product catalog structure, categories, product attributes, and any product-specific requirements for the online store.'
					},
					{
						title: 'Store Functionality Planning',
						description:
							'I will define the required eCommerce functionality, including shopping cart, checkout flow, customer accounts, shipping, payment methods, and other store features.'
					},
					{
						title: 'Technical Implementation Planning',
						description:
							'I will prepare the technical implementation plan, including integrations, plugins, custom functionality, and development approach.'
					},
					{
						title: 'Project Execution Planning',
						description:
							'I will organize the project into milestones and work items to establish a clear implementation roadmap.'
					},
					{
						title: 'Planning Review & Approval',
						description:
							'I will complete the planning phase review and confirm that all planning activities are ready before starting the design phase.'
					}
				]
			},
			{
				name: 'Designing',
				items: [
					{
						title: 'Design Direction Preparation',
						description:
							'I will prepare the overall visual direction of the website based on the approved planning phase and project requirements.'
					},
					{
						title: 'Homepage Design',
						description:
							'I will design the homepage to establish the overall visual identity and user experience of the website.'
					},
					{
						title: 'Inner Pages Design',
						description:
							'I will design the remaining website pages while maintaining consistency with the approved homepage design.'
					},
					{
						title: 'Product Page Design',
						description:
							'I will design the product detail page to present product information clearly and encourage purchases.'
					},
					{
						title: 'Shopping Experience Design',
						description:
							'I will design the shopping cart and checkout experience to ensure a simple and user-friendly purchasing process.'
					},
					{
						title: 'Mobile Responsive Design',
						description:
							'I will optimize the website design for mobile and tablet devices to provide a consistent experience across screen sizes.'
					},
					{
						title: 'Design Consistency Review',
						description:
							'I will review the complete website design to ensure visual consistency, usability, and alignment with the project goals.'
					},
					{
						title: 'Design Approval',
						description:
							'I will finalize the website design after completing all necessary revisions and preparing it for development.'
					}
				]
			},
			{
				name: 'Developing',
				items: [
					{
						title: 'Development Environment Setup',
						description:
							'I will prepare the website development environment and configure the required project foundation.'
					},
					{
						title: 'Website Structure Development',
						description:
							'I will build the overall website structure based on the approved design and project requirements.'
					},
					{
						title: 'Homepage Development',
						description:
							'I will develop the homepage according to the approved design and functionality.'
					},
					{
						title: 'Inner Pages Development',
						description:
							'I will develop all remaining website pages while maintaining design consistency.'
					},
					{
						title: 'Product Catalog Development',
						description:
							'I will configure products, categories, product attributes, and related store content.'
					},
					{
						title: 'WooCommerce Configuration',
						description:
							'I will configure the core WooCommerce functionality required for the online store.'
					},
					{
						title: 'Payment Gateway Integration',
						description:
							'I will integrate and configure the approved payment methods for secure online transactions.'
					},
					{
						title: 'Shipping Configuration',
						description:
							'I will configure shipping methods, delivery options, and shipping rules according to the project requirements.'
					},
					{
						title: 'Additional Features Development',
						description:
							'I will implement all remaining approved features, integrations, and custom functionality required for the project.'
					},
					{
						title: 'Responsive Optimization',
						description:
							'I will optimize the website to ensure proper functionality across desktop, tablet, and mobile devices.'
					},
					{
						title: 'Development Review',
						description:
							'I will review the completed development work to ensure every planned feature has been implemented successfully.'
					}
				]
			},
			{
				name: 'Testing',
				items: [
					{
						title: 'Functional Testing',
						description:
							'I will verify that all website features operate correctly according to the approved project requirements.'
					},
					{
						title: 'Product Purchase Testing',
						description:
							'I will test the complete purchasing process from product selection to successful order placement.'
					},
					{
						title: 'Payment Testing',
						description:
							'I will verify that all configured payment methods process transactions correctly.'
					},
					{
						title: 'Shipping Testing',
						description:
							'I will verify that shipping calculations, delivery options, and related functionality operate correctly.'
					},
					{
						title: 'Responsive Testing',
						description:
							'I will test the website across desktop, tablet, and mobile devices to ensure a consistent user experience.'
					},
					{
						title: 'Browser Compatibility Testing',
						description:
							'I will verify that the website functions correctly across all major web browsers.'
					},
					{
						title: 'Performance Optimization',
						description:
							"I will optimize the website's loading speed, responsiveness, and overall performance before launch."
					},
					{
						title: 'Bug Fixing',
						description:
							'I will resolve any identified issues discovered during the testing process.'
					},
					{
						title: 'Final Quality Assurance',
						description:
							'I will complete a final quality review to ensure the website is fully prepared for deployment.'
					}
				]
			},
			{
				name: 'Deploying',
				items: [
					{
						title: 'Production Environment Preparation',
						description:
							'I will prepare the production environment and verify that all deployment requirements are ready.'
					},
					{
						title: 'Website Deployment',
						description: 'I will deploy the completed website to the live production server.'
					},
					{
						title: 'Domain & SSL Configuration',
						description:
							'I will configure the domain, SSL certificate, and related production settings where applicable.'
					},
					{
						title: 'Live Website Verification',
						description: 'I will verify that the live website functions correctly after deployment.'
					},
					{
						title: 'Final Client Review',
						description:
							'I will conduct the final project review with the client and address any remaining observations if required.'
					},
					{
						title: 'Project Handover',
						description:
							'I will complete the project handover by delivering the finished website and confirming successful project completion.'
					}
				]
			}
		]
	},
	{
		name: 'Business Website',
		icon: 'ri-briefcase-line',
		milestones: [
			{
				name: 'Planning',
				items: [
					{
						title: 'Project Requirements Review',
						description:
							'I will review the agreed project requirements to ensure every feature and deliverable is clearly understood before work begins.'
					},
					{
						title: 'Reference Materials Analysis',
						description:
							"I will analyze the provided reference websites, design inspirations, and supporting documents to establish the project's direction."
					},
					{
						title: 'Project Scope Confirmation',
						description:
							'I will verify the confirmed scope of work and identify any remaining assumptions before moving into execution.'
					},
					{
						title: 'Website Structure Planning',
						description:
							'I will plan the website structure, page hierarchy, and overall navigation based on the approved requirements.'
					},
					{
						title: 'Content Planning',
						description:
							'I will organize the provided text, images, branding assets, and other content for use throughout the website.'
					},
					{
						title: 'Business Functionality Planning',
						description:
							'I will define the required website functionality, including contact forms, inquiry methods, maps, galleries, testimonials, and other business features.'
					},
					{
						title: 'Technical Implementation Planning',
						description:
							'I will prepare the technical implementation plan, including integrations, plugins, custom functionality, and development approach.'
					},
					{
						title: 'Project Execution Planning',
						description:
							'I will organize the project into milestones and work items to establish a clear implementation roadmap.'
					},
					{
						title: 'Planning Review & Approval',
						description:
							'I will complete the planning phase review and confirm that all planning activities are ready before starting the design phase.'
					}
				]
			},
			{
				name: 'Designing',
				items: [
					{
						title: 'Design Direction Preparation',
						description:
							'I will prepare the overall visual direction of the website based on the approved planning phase and project requirements.'
					},
					{
						title: 'Homepage Design',
						description:
							'I will design the homepage to establish the overall visual identity and user experience of the website.'
					},
					{
						title: 'Inner Pages Design',
						description:
							'I will design the remaining website pages while maintaining consistency with the approved homepage design.'
					},
					{
						title: 'Contact & Inquiry Page Design',
						description:
							'I will design the contact and inquiry sections to encourage visitors to communicate with the business.'
					},
					{
						title: 'Mobile Responsive Design',
						description:
							'I will optimize the website design for mobile and tablet devices to provide a consistent experience across screen sizes.'
					},
					{
						title: 'Design Consistency Review',
						description:
							'I will review the complete website design to ensure visual consistency, usability, and alignment with the project goals.'
					},
					{
						title: 'Design Approval',
						description:
							'I will finalize the website design after completing all necessary revisions and preparing it for development.'
					}
				]
			},
			{
				name: 'Developing',
				items: [
					{
						title: 'Development Environment Setup',
						description:
							'I will prepare the website development environment and configure the required project foundation.'
					},
					{
						title: 'Website Structure Development',
						description:
							'I will build the overall website structure based on the approved design and project requirements.'
					},
					{
						title: 'Homepage Development',
						description:
							'I will develop the homepage according to the approved design and functionality.'
					},
					{
						title: 'Inner Pages Development',
						description:
							'I will develop all remaining website pages while maintaining design consistency.'
					},
					{
						title: 'Contact & Inquiry Features',
						description:
							'I will implement the contact forms, inquiry methods, maps, and other communication features required for the website.'
					},
					{
						title: 'Additional Features Development',
						description:
							'I will implement all remaining approved features, integrations, and custom functionality required for the project.'
					},
					{
						title: 'Responsive Optimization',
						description:
							'I will optimize the website to ensure proper functionality across desktop, tablet, and mobile devices.'
					},
					{
						title: 'Development Review',
						description:
							'I will review the completed development work to ensure every planned feature has been implemented successfully.'
					}
				]
			},
			{
				name: 'Testing',
				items: [
					{
						title: 'Functional Testing',
						description:
							'I will verify that all website features operate correctly according to the approved project requirements.'
					},
					{
						title: 'Contact Form Testing',
						description:
							'I will verify that all contact forms and inquiry methods function correctly and deliver submissions successfully.'
					},
					{
						title: 'Responsive Testing',
						description:
							'I will test the website across desktop, tablet, and mobile devices to ensure a consistent user experience.'
					},
					{
						title: 'Browser Compatibility Testing',
						description:
							'I will verify that the website functions correctly across all major web browsers.'
					},
					{
						title: 'Performance Optimization',
						description:
							"I will optimize the website's loading speed, responsiveness, and overall performance before launch."
					},
					{
						title: 'Bug Fixing',
						description:
							'I will resolve any identified issues discovered during the testing process.'
					},
					{
						title: 'Final Quality Assurance',
						description:
							'I will complete a final quality review to ensure the website is fully prepared for deployment.'
					}
				]
			},
			{
				name: 'Deploying',
				items: [
					{
						title: 'Production Environment Preparation',
						description:
							'I will prepare the production environment and verify that all deployment requirements are ready.'
					},
					{
						title: 'Website Deployment',
						description: 'I will deploy the completed website to the live production server.'
					},
					{
						title: 'Domain & SSL Configuration',
						description:
							'I will configure the domain, SSL certificate, and related production settings where applicable.'
					},
					{
						title: 'Live Website Verification',
						description: 'I will verify that the live website functions correctly after deployment.'
					},
					{
						title: 'Final Client Review',
						description:
							'I will conduct the final project review with the client and address any remaining observations if required.'
					},
					{
						title: 'Project Handover',
						description:
							'I will complete the project handover by delivering the finished website and confirming successful project completion.'
					}
				]
			}
		]
	},
	{
		name: 'Website Development',
		icon: 'ri-code-s-slash-line',
		milestones: [
			{
				name: 'Planning',
				items: [
					{
						title: 'Project Requirements Review',
						description:
							'I will review the agreed project requirements to ensure every feature and deliverable is clearly understood before development begins.'
					},
					{
						title: 'Design File Review',
						description:
							'I will review the provided design files or approved layouts to fully understand the expected implementation.'
					},
					{
						title: 'Reference Materials Analysis',
						description:
							'I will analyze any provided reference websites, supporting documents, and project assets to guide the development process.'
					},
					{
						title: 'Project Scope Confirmation',
						description:
							'I will verify the confirmed scope of work and identify any remaining assumptions before moving into execution.'
					},
					{
						title: 'Content Review',
						description:
							'I will review the provided content or identify where placeholder content will be used during development.'
					},
					{
						title: 'Website Structure Review',
						description:
							'I will review the required website pages, navigation, and overall structure based on the approved design.'
					},
					{
						title: 'Functionality Planning',
						description:
							'I will define the required website functionality, including forms, animations, integrations, and interactive elements.'
					},
					{
						title: 'Technical Implementation Planning',
						description:
							'I will prepare the technical implementation plan, including integrations, plugins, custom functionality, and development approach.'
					},
					{
						title: 'Project Execution Planning',
						description:
							'I will organize the project into milestones and work items to establish a clear implementation roadmap.'
					},
					{
						title: 'Planning Review & Approval',
						description:
							'I will complete the planning phase review and confirm that all planning activities are ready before development begins.'
					}
				]
			},
			{
				name: 'Developing',
				items: [
					{
						title: 'Development Environment Setup',
						description:
							'I will prepare the website development environment and configure the required project foundation.'
					},
					{
						title: 'Website Structure Development',
						description:
							'I will build the website structure according to the approved design and project requirements.'
					},
					{
						title: 'Homepage Development',
						description: 'I will develop the homepage to accurately match the approved design.'
					},
					{
						title: 'Inner Pages Development',
						description:
							'I will develop all remaining website pages while maintaining consistency with the approved design.'
					},
					{
						title: 'Content Integration',
						description:
							'I will integrate the provided content or appropriate placeholder content throughout the website.'
					},
					{
						title: 'Interactive Features Development',
						description:
							'I will implement the approved forms, animations, interactive elements, and required functionality.'
					},
					{
						title: 'Responsive Development',
						description:
							'I will ensure the website functions correctly across desktop, tablet, and mobile devices.'
					},
					{
						title: 'Additional Features Development',
						description:
							'I will implement all remaining approved features and project-specific functionality.'
					},
					{
						title: 'Development Review',
						description:
							'I will review the completed development work to ensure it accurately reflects the approved design and requirements.'
					}
				]
			},
			{
				name: 'Testing',
				items: [
					{
						title: 'Functional Testing',
						description:
							'I will verify that all website features operate correctly according to the approved project requirements.'
					},
					{
						title: 'Design Accuracy Review',
						description:
							'I will verify that the completed website accurately reflects the approved design across all pages.'
					},
					{
						title: 'Responsive Testing',
						description:
							'I will test the website across desktop, tablet, and mobile devices to ensure a consistent experience.'
					},
					{
						title: 'Browser Compatibility Testing',
						description:
							'I will verify that the website functions correctly across all major web browsers.'
					},
					{
						title: 'Performance Optimization',
						description:
							"I will optimize the website's loading speed, responsiveness, and overall performance before launch."
					},
					{
						title: 'Bug Fixing',
						description:
							'I will resolve any identified issues discovered during the testing process.'
					},
					{
						title: 'Final Quality Assurance',
						description:
							'I will complete a final quality review to ensure the website is fully prepared for deployment.'
					}
				]
			},
			{
				name: 'Deploying',
				items: [
					{
						title: 'Production Environment Preparation',
						description:
							'I will prepare the production environment and verify that all deployment requirements are ready.'
					},
					{
						title: 'Website Deployment',
						description: 'I will deploy the completed website to the live production server.'
					},
					{
						title: 'Domain & SSL Configuration',
						description:
							'I will configure the domain, SSL certificate, and related production settings where applicable.'
					},
					{
						title: 'Live Website Verification',
						description: 'I will verify that the live website functions correctly after deployment.'
					},
					{
						title: 'Final Client Review',
						description:
							'I will conduct the final project review with the client and address any remaining observations if required.'
					},
					{
						title: 'Project Handover',
						description:
							'I will complete the project handover by delivering the finished website and confirming successful project completion.'
					}
				]
			}
		]
	},
	{
		name: 'Website Redesign',
		icon: 'ri-brush-line',
		milestones: [
			{
				name: 'Planning',
				items: [
					{
						title: 'Existing Website Review',
						description:
							'I will thoroughly review the current website to understand its structure, functionality, strengths, and areas that require improvement.'
					},
					{
						title: 'Project Requirements Review',
						description:
							'I will review the agreed project requirements to ensure every redesign objective and deliverable is clearly understood before work begins.'
					},
					{
						title: 'Reference Materials Analysis',
						description:
							'I will analyze the provided reference websites, design inspirations, and supporting materials to establish the redesign direction.'
					},
					{
						title: 'Existing Content Review',
						description:
							'I will review the existing website content to determine what should be retained, updated, replaced, or removed.'
					},
					{
						title: 'Website Structure Planning',
						description:
							'I will plan the updated website structure, page hierarchy, and navigation to improve usability and organization.'
					},
					{
						title: 'Content Migration Planning',
						description:
							'I will identify which existing content, media, and assets will be migrated into the redesigned website.'
					},
					{
						title: 'Existing Functionality Review',
						description:
							'I will review the current website functionality and determine which features should be preserved, improved, or replaced.'
					},
					{
						title: 'New Functionality Planning',
						description:
							'I will define any additional features and functionality required for the redesigned website.'
					},
					{
						title: 'Technical Implementation Planning',
						description:
							'I will prepare the technical implementation plan, including integrations, plugins, custom functionality, and development approach.'
					},
					{
						title: 'SEO & URL Preservation Planning',
						description:
							'I will review existing URLs and important SEO elements to minimize search engine impact during the redesign process.'
					},
					{
						title: 'Project Execution Planning',
						description:
							'I will organize the project into milestones and work items to establish a clear implementation roadmap.'
					},
					{
						title: 'Planning Review & Approval',
						description:
							'I will complete the planning phase review and confirm that all planning activities are ready before starting the design phase.'
					}
				]
			},
			{
				name: 'Designing',
				items: [
					{
						title: 'Design Direction Preparation',
						description:
							'I will prepare the overall visual direction of the redesigned website based on the approved planning phase and project objectives.'
					},
					{
						title: 'Homepage Redesign',
						description:
							"I will redesign the homepage to improve visual appeal, usability, and user engagement while supporting the project's goals."
					},
					{
						title: 'Inner Pages Redesign',
						description:
							'I will redesign the remaining website pages while maintaining consistency throughout the user experience.'
					},
					{
						title: 'Existing Content Layout Review',
						description:
							'I will adapt the existing content into the new design while improving readability and visual presentation.'
					},
					{
						title: 'New Content Layout Design',
						description:
							'I will design layouts for any newly added sections or pages required for the redesigned website.'
					},
					{
						title: 'Mobile Responsive Design',
						description:
							'I will optimize the redesigned layouts for mobile and tablet devices to ensure a consistent user experience across screen sizes.'
					},
					{
						title: 'User Experience Review',
						description:
							'I will review the complete user experience to ensure intuitive navigation and improved usability throughout the website.'
					},
					{
						title: 'Design Consistency Review',
						description:
							'I will review the complete website design to ensure visual consistency, branding, and alignment with the approved direction.'
					},
					{
						title: 'Design Approval',
						description:
							'I will finalize the redesigned website after completing all necessary revisions and preparing it for development.'
					}
				]
			},
			{
				name: 'Developing',
				items: [
					{
						title: 'Development Environment Setup',
						description:
							'I will prepare the website development environment and configure the required project foundation.'
					},
					{
						title: 'Website Structure Development',
						description:
							'I will build the updated website structure based on the approved redesign.'
					},
					{
						title: 'Homepage Development',
						description:
							'I will develop the redesigned homepage according to the approved design and functionality.'
					},
					{
						title: 'Inner Pages Development',
						description:
							'I will develop the redesigned inner pages while maintaining design consistency throughout the website.'
					},
					{
						title: 'Existing Content Migration',
						description:
							'I will migrate the approved existing content into the redesigned website while maintaining accuracy and formatting.'
					},
					{
						title: 'New Content Integration',
						description:
							'I will integrate any newly created content, images, and business information required for the redesigned website.'
					},
					{
						title: 'Existing Feature Migration',
						description:
							'I will rebuild or migrate approved website functionality from the existing website into the redesigned version.'
					},
					{
						title: 'New Feature Development',
						description:
							'I will implement all newly approved features, integrations, and custom functionality required for the redesigned website.'
					},
					{
						title: 'Responsive Optimization',
						description:
							'I will optimize the redesigned website to ensure proper functionality across desktop, tablet, and mobile devices.'
					},
					{
						title: 'Development Review',
						description:
							'I will review the completed development work to ensure every approved feature has been implemented successfully.'
					}
				]
			},
			{
				name: 'Testing',
				items: [
					{
						title: 'Functional Testing',
						description:
							'I will verify that all website features operate correctly according to the approved project requirements.'
					},
					{
						title: 'Content Verification',
						description:
							'I will verify that all migrated and newly added content is accurate, complete, and properly displayed throughout the website.'
					},
					{
						title: 'Link Verification',
						description:
							'I will verify that all internal and external links function correctly and point to the appropriate destinations.'
					},
					{
						title: 'Responsive Testing',
						description:
							'I will test the redesigned website across desktop, tablet, and mobile devices to ensure a consistent user experience.'
					},
					{
						title: 'Browser Compatibility Testing',
						description:
							'I will verify that the website functions correctly across all major web browsers.'
					},
					{
						title: 'Performance Optimization',
						description:
							"I will optimize the website's loading speed, responsiveness, and overall performance before launch."
					},
					{
						title: 'SEO Verification',
						description:
							'I will verify that important SEO elements, metadata, and page structure have been preserved or properly implemented where applicable.'
					},
					{
						title: 'Bug Fixing',
						description:
							'I will resolve any identified issues discovered during the testing process.'
					},
					{
						title: 'Final Quality Assurance',
						description:
							'I will complete a final quality review to ensure the redesigned website is fully prepared for deployment.'
					}
				]
			},
			{
				name: 'Deploying',
				items: [
					{
						title: 'Production Environment Preparation',
						description:
							'I will prepare the production environment and verify that all deployment requirements are ready.'
					},
					{
						title: 'Website Backup Verification',
						description:
							'I will verify that a complete backup of the existing live website is available before deployment begins.'
					},
					{
						title: 'Website Deployment',
						description: 'I will deploy the redesigned website to the live production environment.'
					},
					{
						title: 'Domain & SSL Verification',
						description:
							'I will verify the domain, SSL certificate, and production configuration after deployment.'
					},
					{
						title: 'Live Website Verification',
						description:
							'I will verify that the redesigned website functions correctly in the live environment after deployment.'
					},
					{
						title: 'Redirect & URL Verification',
						description:
							'I will verify that important URLs, redirects, and navigation function correctly after the website goes live.'
					},
					{
						title: 'Final Client Review',
						description:
							'I will conduct the final project review with the client and address any remaining observations if required.'
					},
					{
						title: 'Project Handover',
						description:
							'I will complete the project handover by delivering the redesigned website and confirming successful project completion.'
					}
				]
			}
		]
	},
	{
		name: 'Custom Development',
		icon: 'ri-terminal-box-line',
		milestones: [
			{
				name: 'Planning',
				items: [
					{
						title: 'Project Requirements Review',
						description:
							'I will review the agreed project requirements to ensure every feature, workflow, and deliverable is clearly understood before development begins.'
					},
					{
						title: 'Business Process Analysis',
						description:
							"I will analyze the client's business processes to understand how the application should solve the identified problems."
					},
					{
						title: 'User Roles & Permissions Planning',
						description:
							'I will define the different user roles, permissions, and access levels required for the application.'
					},
					{
						title: 'Feature Scope Confirmation',
						description:
							'I will verify the confirmed feature list and identify any remaining assumptions before moving into execution.'
					},
					{
						title: 'Workflow Planning',
						description:
							"I will plan the application's user flows and operational workflows to ensure an efficient user experience."
					},
					{
						title: 'Data Structure Planning',
						description:
							'I will identify the core information that the application will manage and organize throughout the project.'
					},
					{
						title: 'Integration Planning',
						description:
							'I will review any required third-party services, APIs, payment providers, or external integrations needed for the application.'
					},
					{
						title: 'Technical Implementation Planning',
						description:
							'I will prepare the overall implementation strategy, architecture, and development approach for the project.'
					},
					{
						title: 'Project Execution Planning',
						description:
							'I will organize the project into milestones and work items to establish a clear implementation roadmap.'
					},
					{
						title: 'Planning Review & Approval',
						description:
							'I will complete the planning phase review and confirm that all planning activities are ready before starting the design phase.'
					}
				]
			},
			{
				name: 'Designing',
				items: [
					{
						title: 'Application Design Direction',
						description:
							'I will establish the overall visual direction and user experience of the application based on the approved requirements.'
					},
					{
						title: 'Dashboard Design',
						description:
							"I will design the application's dashboard to provide users with a clear and efficient overview of their information."
					},
					{
						title: 'Core Feature Interface Design',
						description:
							"I will design the interfaces for the application's primary features and workflows."
					},
					{
						title: 'Forms & Data Entry Design',
						description:
							'I will design forms and input screens to ensure efficient and user-friendly data management.'
					},
					{
						title: 'Navigation Design',
						description:
							"I will design the application's navigation structure to provide a consistent and intuitive user experience."
					},
					{
						title: 'Responsive Interface Design',
						description:
							'I will optimize the application interface for desktop, tablet, and mobile devices where applicable.'
					},
					{
						title: 'User Experience Review',
						description:
							'I will review the complete application flow to ensure usability, consistency, and efficiency.'
					},
					{
						title: 'Design Approval',
						description:
							'I will finalize the application design after completing all necessary revisions and preparing it for development.'
					}
				]
			},
			{
				name: 'Developing',
				items: [
					{
						title: 'Development Environment Setup',
						description:
							'I will prepare the development environment and configure the required project foundation.'
					},
					{
						title: 'Authentication Development',
						description:
							'I will implement the user authentication system and secure access to the application.'
					},
					{
						title: 'User Role Implementation',
						description:
							'I will implement user roles and permission controls according to the approved requirements.'
					},
					{
						title: 'Core Feature Development',
						description: "I will develop the application's primary features and business workflows."
					},
					{
						title: 'Data Management Development',
						description:
							'I will implement the functionality required to create, update, organize, and manage application data.'
					},
					{
						title: 'Integration Development',
						description:
							'I will implement the approved third-party integrations and external services required for the project.'
					},
					{
						title: 'Additional Feature Development',
						description:
							'I will implement all remaining approved functionality and custom business requirements.'
					},
					{
						title: 'Responsive Optimization',
						description:
							'I will optimize the application to ensure a consistent experience across supported devices and screen sizes.'
					},
					{
						title: 'Development Review',
						description:
							'I will review the completed development work to ensure every approved feature has been implemented successfully.'
					}
				]
			},
			{
				name: 'Testing',
				items: [
					{
						title: 'Functional Testing',
						description:
							'I will verify that all application features operate correctly according to the approved project requirements.'
					},
					{
						title: 'User Workflow Testing',
						description:
							'I will verify that every user workflow operates smoothly from start to finish.'
					},
					{
						title: 'User Role Testing',
						description:
							'I will verify that all user roles and permissions function correctly according to the approved access rules.'
					},
					{
						title: 'Integration Testing',
						description:
							'I will verify that all third-party integrations communicate and function correctly.'
					},
					{
						title: 'Responsive Testing',
						description:
							'I will test the application across supported devices and screen sizes to ensure a consistent experience.'
					},
					{
						title: 'Browser Compatibility Testing',
						description:
							'I will verify that the application functions correctly across all supported web browsers.'
					},
					{
						title: 'Performance Optimization',
						description:
							"I will optimize the application's loading speed, responsiveness, and overall performance before deployment."
					},
					{
						title: 'Bug Fixing',
						description:
							'I will resolve any identified issues discovered during the testing process.'
					},
					{
						title: 'Final Quality Assurance',
						description:
							'I will complete a final quality review to ensure the application is fully prepared for deployment.'
					}
				]
			},
			{
				name: 'Deploying',
				items: [
					{
						title: 'Production Environment Preparation',
						description:
							'I will prepare the production environment and verify that all deployment requirements are ready.'
					},
					{
						title: 'Application Deployment',
						description:
							'I will deploy the completed application to the live production environment.'
					},
					{
						title: 'Production Configuration',
						description:
							'I will configure the production environment, domain, SSL certificate, and related deployment settings where applicable.'
					},
					{
						title: 'Live Application Verification',
						description:
							'I will verify that the live application functions correctly after deployment.'
					},
					{
						title: 'Final Client Review',
						description:
							'I will conduct the final project review with the client and address any remaining observations if required.'
					},
					{
						title: 'Project Handover',
						description:
							'I will complete the project handover by delivering the finished application and confirming successful project completion.'
					}
				]
			}
		]
	},
	{
		name: 'Landing Page',
		icon: 'ri-pages-line',
		milestones: [
			{
				name: 'Planning',
				items: [
					{
						title: 'Project Requirements Review',
						description:
							'I will review the agreed project requirements to ensure every objective, feature, and deliverable is clearly understood before work begins.'
					},
					{
						title: 'Reference Materials Analysis',
						description:
							'I will analyze the provided reference websites, design inspirations, and supporting materials to establish the landing page direction.'
					},
					{
						title: 'Landing Page Goal Definition',
						description:
							'I will define the primary goal of the landing page, including the desired user action and overall conversion objective.'
					},
					{
						title: 'Target Audience Planning',
						description:
							'I will review the intended audience to ensure the landing page effectively communicates the right message.'
					},
					{
						title: 'Content Planning',
						description:
							'I will organize the provided content and determine how headlines, sections, images, and other assets will be presented.'
					},
					{
						title: 'Section Structure Planning',
						description:
							'I will plan the layout and sequence of the landing page sections to create a clear and engaging user journey.'
					},
					{
						title: 'Call-to-Action Planning',
						description:
							'I will define the primary and supporting call-to-action elements to maximize user engagement and conversions.'
					},
					{
						title: 'Technical Implementation Planning',
						description:
							'I will prepare the technical implementation plan, including forms, integrations, tracking tools, and development approach where applicable.'
					},
					{
						title: 'Project Execution Planning',
						description:
							'I will organize the project into milestones and work items to establish a clear implementation roadmap.'
					},
					{
						title: 'Planning Review & Approval',
						description:
							'I will complete the planning phase review and confirm that all planning activities are ready before starting the design phase.'
					}
				]
			},
			{
				name: 'Designing',
				items: [
					{
						title: 'Design Direction Preparation',
						description:
							'I will prepare the overall visual direction of the landing page based on the approved planning phase and project objectives.'
					},
					{
						title: 'Hero Section Design',
						description:
							'I will design the hero section to create a strong first impression and communicate the primary value proposition.'
					},
					{
						title: 'Content Sections Design',
						description:
							'I will design the remaining landing page sections to clearly present the product, service, or campaign information.'
					},
					{
						title: 'Call-to-Action Design',
						description:
							'I will design the primary and supporting call-to-action sections to encourage user interaction and conversions.'
					},
					{
						title: 'Mobile Responsive Design',
						description:
							'I will optimize the landing page design for mobile and tablet devices to provide a consistent user experience across screen sizes.'
					},
					{
						title: 'Design Consistency Review',
						description:
							'I will review the complete landing page design to ensure visual consistency, usability, and alignment with the project goals.'
					},
					{
						title: 'Design Approval',
						description:
							'I will finalize the landing page design after completing all necessary revisions and preparing it for development.'
					}
				]
			},
			{
				name: 'Developing',
				items: [
					{
						title: 'Development Environment Setup',
						description:
							'I will prepare the development environment and configure the required project foundation.'
					},
					{
						title: 'Landing Page Development',
						description:
							'I will develop the landing page according to the approved design and project requirements.'
					},
					{
						title: 'Content Integration',
						description:
							'I will integrate the approved content, images, and media throughout the landing page.'
					},
					{
						title: 'Form & Conversion Features',
						description:
							'I will implement the required contact forms, lead capture forms, or other conversion-focused functionality.'
					},
					{
						title: 'Third-Party Integration',
						description:
							'I will integrate any approved analytics, marketing tools, or external services required for the landing page.'
					},
					{
						title: 'Responsive Optimization',
						description:
							'I will optimize the landing page to ensure proper functionality across desktop, tablet, and mobile devices.'
					},
					{
						title: 'Development Review',
						description:
							'I will review the completed development work to ensure every approved feature has been implemented successfully.'
					}
				]
			},
			{
				name: 'Testing',
				items: [
					{
						title: 'Functional Testing',
						description:
							'I will verify that all landing page features operate correctly according to the approved project requirements.'
					},
					{
						title: 'Form Testing',
						description:
							'I will verify that all forms, submissions, and lead collection functionality operate correctly.'
					},
					{
						title: 'Responsive Testing',
						description:
							'I will test the landing page across desktop, tablet, and mobile devices to ensure a consistent user experience.'
					},
					{
						title: 'Browser Compatibility Testing',
						description:
							'I will verify that the landing page functions correctly across all major web browsers.'
					},
					{
						title: 'Performance Optimization',
						description:
							"I will optimize the landing page's loading speed, responsiveness, and overall performance before launch."
					},
					{
						title: 'Bug Fixing',
						description:
							'I will resolve any identified issues discovered during the testing process.'
					},
					{
						title: 'Final Quality Assurance',
						description:
							'I will complete a final quality review to ensure the landing page is fully prepared for deployment.'
					}
				]
			},
			{
				name: 'Deploying',
				items: [
					{
						title: 'Production Environment Preparation',
						description:
							'I will prepare the production environment and verify that all deployment requirements are ready.'
					},
					{
						title: 'Landing Page Deployment',
						description:
							'I will deploy the completed landing page to the live production environment.'
					},
					{
						title: 'Domain & SSL Configuration',
						description:
							'I will configure the domain, SSL certificate, and related production settings where applicable.'
					},
					{
						title: 'Live Landing Page Verification',
						description:
							'I will verify that the live landing page functions correctly after deployment.'
					},
					{
						title: 'Analytics & Tracking Verification',
						description:
							'I will verify that the approved analytics, tracking tools, and conversion monitoring are functioning correctly where applicable.'
					},
					{
						title: 'Final Client Review',
						description:
							'I will conduct the final project review with the client and address any remaining observations if required.'
					},
					{
						title: 'Project Handover',
						description:
							'I will complete the project handover by delivering the finished landing page and confirming successful project completion.'
					}
				]
			}
		]
	}
];

/**
 * Seed a private, fully-editable copy of every default template for one admin.
 * Runs with the service-role client (RLS bypassed) from signup and the one-time
 * backfill. Idempotency is the caller's concern — this always inserts.
 */
export async function seedDefaultTemplatesForAdmin(
	client: SupabaseClient<Database>,
	adminId: string
): Promise<void> {
	for (const [tIndex, tpl] of DEFAULT_TEMPLATES.entries()) {
		const { data: templateRow, error: templateErr } = await client
			.from('templates')
			.insert({
				admin_id: adminId,
				name: tpl.name,
				icon: tpl.icon,
				description: tpl.description ?? null,
				position: tIndex
			})
			.select('id')
			.single();
		if (templateErr) throw templateErr;

		const { data: milestoneRows, error: milestoneErr } = await client
			.from('template_milestones')
			.insert(
				tpl.milestones.map((m, i) => ({
					template_id: templateRow.id,
					name: m.name,
					position: i
				}))
			)
			.select('id, position');
		if (milestoneErr) throw milestoneErr;

		const milestoneIdByPosition = new Map(milestoneRows.map((r) => [r.position, r.id]));

		const itemRows = tpl.milestones.flatMap((m, i) =>
			m.items.map((item, j) => ({
				template_milestone_id: milestoneIdByPosition.get(i)!,
				title: item.title,
				description: item.description,
				default_status: 'not_started' as const,
				position: j
			}))
		);

		const { error: itemErr } = await client.from('template_items').insert(itemRows);
		if (itemErr) throw itemErr;
	}
}
