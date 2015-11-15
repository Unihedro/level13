// Helper methods related to player actions (costs, requirements, descriptions) - common definitions for all actions
define([
    'ash',
	'game/constants/PlayerActionConstants',
	'game/constants/ItemConstants',
    'game/nodes/player/PlayerStatsNode',
    'game/nodes/player/PlayerResourcesNode',
    'game/nodes/PlayerLocationNode',
    'game/nodes/tribe/TribeUpgradesNode',
    'game/nodes/sector/CampNode',
    'game/nodes/NearestCampNode',
    'game/components/common/PositionComponent',
    'game/components/common/PlayerActionComponent',
    'game/components/player/ItemsComponent',
    'game/components/player/PerksComponent',
    'game/components/player/DeityComponent',
    'game/components/sector/PassagesComponent',
    'game/components/sector/EnemiesComponent',
    'game/components/sector/MovementOptionsComponent',
    'game/components/sector/SectorFeaturesComponent',
    'game/components/sector/SectorStatusComponent',
    'game/components/sector/SectorLocalesComponent',
    'game/components/sector/SectorControlComponent',
    'game/components/sector/improvements/SectorImprovementsComponent',
    'game/components/common/CampComponent',
], function (
	Ash, PlayerActionConstants, ItemConstants,
	PlayerStatsNode, PlayerResourcesNode, PlayerLocationNode, TribeUpgradesNode, CampNode, NearestCampNode,
	PositionComponent, PlayerActionComponent, ItemsComponent, PerksComponent, DeityComponent,
	PassagesComponent, EnemiesComponent, MovementOptionsComponent,
	SectorFeaturesComponent, SectorStatusComponent, SectorLocalesComponent, SectorControlComponent, SectorImprovementsComponent,
	CampComponent
) {
    var PlayerActionsHelper = Ash.Class.extend({
		
		resourcesHelper: null,
		
		gameState: null,

        playerStatsNodes: null,
		playerResourcesNodes: null,
		playerLocationNodes: null,
        tribeUpgradesNodes: null,
        nearestCampNodes: null,
		
		constructor: function (engine, gameState, resourcesHelper) {
			this.engine = engine;
			this.gameState = gameState;
			this.resourcesHelper = resourcesHelper;
            this.playerStatsNodes = engine.getNodeList(PlayerStatsNode);
            this.playerResourcesNodes = engine.getNodeList(PlayerResourcesNode);
            this.playerLocationNodes = engine.getNodeList(PlayerLocationNode);
            this.tribeUpgradesNodes = engine.getNodeList(TribeUpgradesNode);
            this.nearestCampNodes = engine.getNodeList(NearestCampNode);
		},
        
        getItemForCraftAction: function (actionName) {
			var baseActionName = this.getBaseActionID(actionName);
            switch (baseActionName) {
				case "craft":
					return ItemConstants.getItemByID(this.getActionIDParam(actionName));
				
				default: return null;
            }
        },
		
		deductCosts: function (action) {
            var costs = this.getCosts(action, this.getOrdinal(action), this.getCostFactor(action));
            
            if (!costs) {
                return;
            }
            
			var currentStorage = this.resourcesHelper.getCurrentStorage();
            var itemsComponent = this.playerStatsNodes.head.entity.get(ItemsComponent);
            
            var costNameParts;
            var costAmount;
            for (var costName in costs) {
                costNameParts = costName.split("_");
                costAmount = costs[costName];
                if (costName === "stamina") {
                    this.playerStatsNodes.head.stamina.stamina -= costAmount;
                } else if (costName === "rumours") {
                    this.playerStatsNodes.head.rumours.value -= costAmount;
                } else if (costName === "favour") {
                    this.playerStatsNodes.head.entity.get(DeityComponent).favour -= costAmount;
                } else if (costName === "evidence") {
                    this.playerStatsNodes.head.evidence.value -= costAmount;
                } else if (costNameParts[0] === "resource") {
                    currentStorage.resources.addResource(costNameParts[1], -costAmount);
                } else if (costNameParts[0] === "item") {
                    var itemId = costName.replace(costNameParts[0] + "_", "");
                    for (var i = 0; i < costAmount; i++) {
                        itemsComponent.discardItem(itemsComponent.getItem(itemId));
                    }
                } else {
                    console.log("WARN: unknown cost: " + costName);
                }
            }
        },
		
		// Check both costs and requirements - everything that is needed for the player action
        checkAvailability: function (action, log, otherSector) {
            if (this.checkRequirements(action, log, otherSector).value < 1) return false;
            if (this.checkCosts(action, log, otherSector) < 1) return false;
            
            return true;
        },
		
		// Check requirements (not costs) of an action
        // returns an object containing:
        // value: fraction the player has of requirements or 0 depending on req type (if 0, action is not available)
        // reason: string to describe the non-passed requirement (for button explanations)
        checkRequirements: function (action, log, otherSector) {
            var playerVision = this.playerStatsNodes.head.vision.value;
            var playerPerks = this.playerResourcesNodes.head.entity.get(PerksComponent);
            var deityComponent = this.playerResourcesNodes.head.entity.get(DeityComponent);
            
            var sector = otherSector || this.playerLocationNodes.head.entity;
            if (!sector) return { value: 0, reason: "No selected sector" };
            
            var requirements = this.getReqs(action, sector);
            var costs = this.getCosts(action, this.getOrdinal(action), this.getCostFactor(action));
            var improvementComponent = sector.get(SectorImprovementsComponent);
            var movementOptionsComponent = sector.get(MovementOptionsComponent);
            var passagesComponent = sector.get(PassagesComponent);
            var campComponent = sector.get(CampComponent);
            var featuresComponent = sector.get(SectorFeaturesComponent);
            var statusComponent = sector.get(SectorStatusComponent);
			var playerActionComponent = this.playerResourcesNodes.head.entity.get(PlayerActionComponent);
            
            var lowestFraction = 1;
            var reason = "";
            
            if (action === "move_level_up" && !movementOptionsComponent.canMoveUp)
                return { value: 0, reason: "Blocked. " + movementOptionsComponent.cantMoveUpReason };
            if (action === "move_level_down" && !movementOptionsComponent.canMoveDown)
                return { value: 0, reason: "Blocked. " + movementOptionsComponent.cantMoveDownReason };
                
			if (costs) {
				if (requirements && costs.stamina > 0) {
					requirements.health = costs.stamina;
				}
                if (costs.favour && !this.gameState.unlockedFeatures.favour) {
					reason = "Locked stats.";
					return { value: 0, reason: reason };
                }
				if ((costs.resource_fuel > 0 && !this.gameState.unlockedFeatures.resources.fuel) ||
					(costs.resource_herbs > 0 && !this.gameState.unlockedFeatures.resources.herbs) ||
					(costs.resource_tools > 0 && !this.gameState.unlockedFeatures.resources.tools) ||
					(costs.resource_concrete > 0 && !this.gameState.unlockedFeatures.resources.concrete)) {
					reason = "Locked resources.";
					return { value: 0, reason: reason };
				}
			}
                
            if (requirements) {
                if (requirements.vision) {
                    if (playerVision < requirements.vision) {
                        if (log) console.log("WARN: Not enough vision to perform action [" + action + "]");
                        reason = requirements.vision + " vision needed.";
                        lowestFraction = Math.min(lowestFraction, playerVision / requirements.vision);
                    }
                }
                
                if (requirements.stamina) {
                    var playerStamina = this.playerStatsNodes.head.stamina.stamina;
                    if (playerStamina < requirements.stamina) {
                        if (log) console.log("WARN: Not enough stamina to perform action [" + action + "]");
                        lowestFraction = Math.min(lowestFraction, playerStamina / requirements.stamina);
                    }
                }
                
                if (requirements.health) {
                    var playerHealth = this.playerStatsNodes.head.stamina.health;
                    if (playerHealth < requirements.health) {
                        reason = requirements.health + " health required.";
                        if (log) console.log("WARN: " + reason);
                        lowestFraction = Math.min(lowestFraction, playerHealth / requirements.health);
                    }
                }
                
                if (typeof requirements.sunlit !== "undefined") {
                    var currentValue = featuresComponent.sunlit;
                    var requiredValue = requirements.sunlit;
                    if (currentValue !== requiredValue) {
                        if (currentValue) reason = "Sunlight not allowed.";
                        else reason = "Sunlight required.";
                        if (log) console.log("WARN: " + reason);
                        return { value: 0, reason: reason };
                    }
                }
                
                if (requirements.deity) {
                    if (!deityComponent) {
                        return { value: 0, reason: "Deity required." };
                    }
                }
                
                if (typeof requirements.rumourpoolchecked != "undefined") {
                    if (sector.has(CampComponent)) {
                        var campValue = sector.get(CampComponent).rumourpoolchecked;
                        if (requirements.rumourpoolchecked != campValue) {
                            if (!requirements.rumourpoolchecked) reason = "No new rumours at the moment.";
                            if (requirements.rumourpoolchecked) reason = "There are new rumours.";
                            return { value: 0, reason: reason };
                        }
                    }
                }
                
                if (requirements.population) {
                    var min = requirements.population[0];
                    var max = requirements.population[1];
                    if (max < 0) max = 9999999;
                    var currentPopulation = campComponent ? campComponent.population : 0;
                    if (currentPopulation < min || currentPopulation > max) {
                        if (currentPopulation < min) reason = min + " population required.";
                        if (currentPopulation > max) reason = "Maximum " + max + " population.";
                        return { value: 0, reason: reason };
                    }
                }
				
				if (requirements.numCamps) {
					var currentCamps = this.gameState.numCamps;
					if (requirements.numCamps > currentCamps) {
						reason = requirements.numCamps + " camps required.";
                        return { value: currentCamps / requirements.numCamps, reason: reason };
					}
				}
                
                if (requirements.improvements) {
                    var improvementRequirements = requirements.improvements;
                    
                    for(var improvName in improvementRequirements)
                    {
                        var requirementDef = improvementRequirements[improvName];
                        var min = requirementDef[0];
                        var max = requirementDef[1];
                        if (max < 0) max = 9999999;
                        
                        var amount = 0;
                        switch(improvName)
                        {
                            case "camp":
								// TODO global function for camps per level & get rid of PositionComponent & engine
								for (var node = this.engine.getNodeList(CampNode).head; node; node = node.next) {
									if (node.entity.get(PositionComponent).level === this.playerLocationNodes.head.position.level)
                                        amount++;
                                }
                                break;
                           
                            case "passageUp":
                                amount =
                                    improvementComponent.getCount(improvementNames.passageUpStairs) +
                                    improvementComponent.getCount(improvementNames.passageUpElevator) +
                                    improvementComponent.getCount(improvementNames.passageUpHole);
                                break;
                            
                            case "passageDown":
                                amount =
                                    improvementComponent.getCount(improvementNames.passageDownStairs) +
                                    improvementComponent.getCount(improvementNames.passageDownElevator) +
                                    improvementComponent.getCount(improvementNames.passageDownHole);
                                break;
                            
                            default:
                                var name = improvementNames[improvName];
                                amount = improvementComponent.getCount(name);
                                break;
                        }
            
                        if (min > amount || max <= amount) {
                            var improvementName = this.getImprovementNameForAction(action, true);
                            if (min > amount) {
								reason = "Improvement required";
								if (min > 1) reason += ": " + min + "x " + improvName;
							} else {
								reason = "Improvement already exists";
								if(max > 1) reason += ": " + max + "x " + improvName;
							}
                            if (log) console.log("WARN: " + reason);
                            if (min > amount) return { value: amount/min, reason: reason };
                            else return { value: 0, reason: reason };
                        }
                    }
                }

                if (requirements.perks) {
                    var perkRequirements = requirements.perks;
                    for(var perkName in perkRequirements)
                    {
                        var requirementDef = perkRequirements[perkName];
                        var min = requirementDef[0];
                        var max = requirementDef[1];
                        if (max < 0) max = 9999999;
                        var totalEffect = playerPerks.getTotalEffect(perkName);
                        if (min > totalEffect || max <= totalEffect) {
                            if (min > totalEffect) reason = "Can't do this while: " + perkName;
                            if (max < totalEffect) reason = "Perk required: " + perkName;
                            if(log) console.log("WARN: " + reason);
                            return { value: 0, reason: reason };
                        }
                    }
                }
                
                if (requirements.upgrades) {
                    var upgradeRequirements = requirements.upgrades;
                    for (var upgradeId in upgradeRequirements) {
                        var requirementBoolean = upgradeRequirements[upgradeId];
                        var hasBoolean = this.tribeUpgradesNodes.head.upgrades.hasBought(upgradeId);
                        if (requirementBoolean != hasBoolean) {
                            if (requirementBoolean) reason = "Upgrade required: " + upgradeId;
                            else reason = "Upgrade already researched (" + upgradeId + ")";
                            if (log) console.log("WARN: " + reason);
                            return { value: 0, reason: reason };
                        }
                    }
                }
                
                if (requirements.blueprint) {
                    var blueprintName = action;
                    var hasBlueprint = this.tribeUpgradesNodes.head.upgrades.hasAvailableBlueprint(blueprintName);
                    if (!hasBlueprint) {
                        reason = "Blueprint required.";
                        return { value: 0, reason: reason };
                    }
                }
				
				if (typeof requirements.busy !== "undefined") {
                    var currentValue = playerActionComponent.isBusy();
                    var requiredValue = requirements.busy;
                    if (currentValue !== requiredValue) {
                        if (currentValue) reason = "Busy " + playerActionComponent.getDescription();
                        else reason = "Need to be busy to do this.";
                        if (log) console.log("WARN: " + reason);
                        return { value: 0, reason: reason };
                    }
				}
                
                if (requirements.sector) {
                    if (requirements.sector.canHaveCamp) {
                        if (!featuresComponent.canHaveCamp()) {
                            if (log) console.log("WARN: Location not suitabe for camp.");
                            return { value: 0, reason: "Location not suitable for camp" };
                        }
                    }
                    if (typeof requirements.sector.control != "undefined") {
                        var sectionControl = sector.get(SectorControlComponent).hasControl();
                        if (sectionControl != requirements.sector.control) {
                            if (log) console.log("WARN: Sector control required / not allowed");
                            return { value: 0, reason: "Sector control required / not allowed" };
                        }
                    }
                    if (typeof requirements.sector.enemies != "undefined") {
                        var enemiesComponent = sector.get(EnemiesComponent);
                        if ((enemiesComponent.possibleEnemies.length > 0) != requirements.sector.enemies) {
                            if (log) console.log("WARN: Sector enemies required / not allowed");
                            return { value: 0, reason: "Sector enemies required / not allowed" };
                        }
                    }
                    if (typeof requirements.sector.scouted != "undefined") {
                        if (statusComponent.scouted != requirements.sector.scouted) {
                            if (statusComponent.scouted)    reason = "Area already scouted.";
                            else                            reason = "Area not scouted yet.";
                            if (log) console.log("WARN: " + reason);
                            return { value: 0, reason: reason };
                        }
                    }
                    
                    if (typeof requirements.sector.scoutedLocales !== "undefined") {
                        for(var localei in requirements.sector.scoutedLocales) {
                            var requiredStatus = requirements.sector.scoutedLocales[localei];
                            var currentStatus = statusComponent.isLocaleScouted(localei);
                            if (requiredStatus !== currentStatus) {
                                if (requiredStatus) reason = "Locale must be scouted.";
                                if (!requiredStatus) reason = "Locale already scouted.";
                                return { value: 0, reason: reason };
                            }
                        }
                    }
                    
                    if (typeof requirements.sector.blockerLeft != 'undefined') {
                        if (!movementOptionsComponent.canMoveLeft) {
                            if (log) console.log("WARN: Movement to left blocked.");
                            return { value: 0, reason: "Blocked. " + movementOptionsComponent.cantMoveLeftReason };
                        }
                    }
					
                    if (typeof requirements.sector.blockerRight != 'undefined') {
                        if (!movementOptionsComponent.canMoveRight) {
                            if (log) console.log("WARN: Movement to right blocked.");
                            return { value: 0, reason: "Blocked. " + movementOptionsComponent.cantMoveRightReason };
                        }
                    }					
					
                    if (typeof requirements.sector.passageUp != 'undefined') {
                        if (!passagesComponent.passageUp) {
							reason = "No passage up.";
                            if (log) console.log("WARN: " + reason);
                            return { value: 0, reason: "Blocked. " + reason };
                        } else {
                            var requiredType = parseInt(requirements.sector.passageUp);
                            if (requiredType > 0) {
                                var existingType = passagesComponent.passageUp.type;
                                if (existingType !== requiredType) {
                                    reason = "Wrong passage type.";
                                    if (log) console.log("WARN: " + reason);
                                    return { value: 0, reason: "Blocked. " + reason };
                                }
                            }
                        }
                    }
                    if (typeof requirements.sector.passageDown != 'undefined') {
                        if (!passagesComponent.passageDown) {
							reason = "No passage down.";
                            if (log) console.log("WARN: " + reason);
                            return { value: 0, reason: "Blocked. " + reason };
                        } else {
                            var requiredType = parseInt(requirements.sector.passageDown);
                            if (requiredType > 0) {
                                var existingType = passagesComponent.passageDown.type;
                                if (existingType != requiredType) {
                                    reason = "Wrong passage type.";
                                    if (log) console.log("WARN: " + reason);
                                    return { value: 0, reason: "Blocked. " + reason };
                                }
                            }                            
                        }
                    }
                    
                    if (typeof requirements.sector.collected_food != "undefined") {                      
                        var collector = improvementComponent.getVO(improvementNames.collector_food);
                        var requiredStorage = requirements.sector.collected_food;
                        var currentStorage = collector.storedResources.getResource(resourceNames.food);
                        if (currentStorage < requiredStorage) {
                            if (log) console.log("WARN: Not enough stored resources in collectors.");
                            lowestFraction = Math.min(lowestFraction, currentStorage / requiredStorage);
                        }
                    }
                    
                    if (typeof requirements.sector.collected_water != "undefined") {                          
                        var collector = improvementComponent.getVO(improvementNames.collector_water);
                        var requiredStorage = requirements.sector.collected_water;
                        var currentStorage = collector.storedResources.getResource(resourceNames.water);
                        if (currentStorage < requiredStorage) {
                            if (log) console.log("WARN: Not enough stored resources in collectors.");
                            lowestFraction = Math.min(lowestFraction, currentStorage / requiredStorage);
                        }
                    }
                }                
                return { value: lowestFraction, reason: reason };
            }
            
            return { value: 1 };
        },
		
        // Check the costs of an action; returns lowest fraction of the cost player can cover; >1 means the action is available
        checkCosts: function(action, log, otherSector) {            
            var costs = this.getCosts(action, this.getOrdinal(action), this.getCostFactor(action));
            if (costs) {
                var currentFraction = 1;
                var lowestFraction = currentFraction;
                for(var key in costs) {
                    currentFraction = this.checkCost(action, key, otherSector);
                    if (currentFraction < lowestFraction) {
                        if(log) console.log("WARN: Not enough " + key + " to perform action [" + action + "]");
                        lowestFraction = currentFraction;
                    }
                }
                return lowestFraction;                
            }
            
            return 1;
        },
        
        // Check if player can afford a cost; returns fraction of the cost the player can cover; >1 means ok
        checkCost: function(action, name, otherSector) {
            var playerVision = this.playerStatsNodes.head.vision.value;
            var playerStamina = this.playerStatsNodes.head.stamina.stamina;
            var playerResources = this.resourcesHelper.getCurrentStorage();
            var itemsComponent = this.playerStatsNodes.head.entity.get(ItemsComponent);
            
            var sector = otherSector || (this.playerLocationNodes.head && this.playerLocationNodes.head.entity);
            if (!sector) return false;
            
            var costs = this.getCosts(action, this.getOrdinal(action), this.getCostFactor(action));
            
            var costNameParts = name.split("_");
            var costAmount = costs[name];
            
            if (costNameParts[0] === "resource") {
                return (playerResources.resources.getResource(costNameParts[1]) / costAmount);
            } else if (costNameParts[0] === "item") {
                var itemId = name.replace(costNameParts[0] + "_", "");
                return itemsComponent.getCountById(itemId) / costAmount;
            } else {            
                switch (name) {
                    case "stamina":
                        return (playerStamina / costs.stamina);                    
                    
                    case "rumours":
                        return (this.playerStatsNodes.head.rumours.value / costs.rumours);
                    
                    case "favour":
                        var favour = this.playerStatsNodes.head.entity.has(DeityComponent) ? this.playerStatsNodes.head.entity.get(DeityComponent).favour : 0;
                        return (favour / costs.favour);
                    
                    case "evidence":
                        return (this.playerStatsNodes.head.evidence.value / costs.evidence);
					
					case "blueprint":
						return 1;
                        
                    default:
                        console.log("WARN: Unknown cost: " + name);
                        return 1;
                }
            }
        },
        
		// Return the ordinal of the action (for example, if the player has 2 houses and wants to build another one, it's 3)
        getOrdinal: function (action) {
            if (!this.playerLocationNodes || !this.playerLocationNodes.head) {
				return 1;
			}
            if (!action) return 1;
            
            var sector = this.playerLocationNodes.head.entity;
            var playerPos = sector.get(PositionComponent);
            
            if (action.indexOf("build_in") >= 0) {
                var improvementName = this.getImprovementNameForAction(action);
                var improvementsComponent = sector.get(SectorImprovementsComponent);
                return improvementsComponent.getCount(improvementName) + 1;
            }
                
            switch (action) {
                case "use_in_inn":
                    var itemsComponent = this.playerStatsNodes.head.entity.get(ItemsComponent);
                    return itemsComponent.getEquipped(ItemConstants.itemTypes.follower).length;
                
                case "build_out_passage_down_stairs":
                case "build_out_passage_down_elevator":
                case "build_out_passage_down_hole":
                case "build_out_passage_up_stairs":
                case "build_out_passage_up_elevator":
                case "build_out_passage_up_hole":
                    var level = action.indexOf("up") > 0 ? playerPos.level + 1 : playerPos.level - 1;
                    return this.gameState.getLevelOrdinal(level);
                
                default: return 1;
            }
        },
        
        // Returns the cost factor of a given action, usually 1, but may depend on the current status for some actions
        getCostFactor: function(action) {
            if (!this.playerLocationNodes || !this.playerLocationNodes.head) return 1;
            
            var sector = this.playerLocationNodes.head.entity;
            var passageComponent = sector.get(PassagesComponent);
            var itemsComponent = this.playerStatsNodes.head.entity.get(ItemsComponent);
            var items = itemsComponent.getEquipped(ItemConstants.itemTypes.shoes);
            
            var factor = 1;
            switch(action) {
                case "move_level_down":
                    factor += passageComponent.passageDown && passageComponent.passageDown.climbable ? 2 : 0;
                    if (items.length > 0) factor *= items[0].bonus;
                    break;
                
                case "move_level_up":
                    factor += passageComponent.passageUp && passageComponent.passageUp.climbable ? 2 : 0;
                    if (items.length > 0) factor *= items[0].bonus;
                    break;
                
                case "move_sector_left":
                case "move_sector_right":
                case "move_camp_level":
                case "move_camp_global":
                    if (items.length > 0) factor *= items[0].bonus;                    
                    break;
            }
            
            return factor;
        },
        
		getReqs: function (action, sector) {
            if (!this.playerLocationNodes.head) return;
            var sector = sector || this.playerLocationNodes.head.entity;
			switch (this.getBaseActionID(action)) {
				case "scout_locale":
					var localei = parseInt(action.split("_")[2]);
					var sectorLocalesComponent = sector.get(SectorLocalesComponent);
					var localeVO = sectorLocalesComponent.locales[localei];
					var requirements = localeVO.requirements;
                    localeVO.requirements.sector = {};
                    localeVO.requirements.sector.scouted = true;
                    localeVO.requirements.sector.scoutedLocales = {};
                    localeVO.requirements.sector.scoutedLocales[localei] = false;
                    return requirements;
				default:
					return PlayerActionConstants.requirements[action];
			}
		},		
        
		getCosts: function (action, ordinal, statusCostFactor, sector) {
			var result = {};
			var costs = PlayerActionConstants.costs[action];
			if (costs) {
				var costFactor = costs.cost_factor;
				if (!costFactor) costFactor = 1;
				if (!ordinal) ordinal = 1;
				if(action == "build_in_house" && ordinal === 1) ordinal = 0.5;
				var ordinalCostFactor = Math.pow(costFactor, ordinal-1);				
				
				for(var key in costs) {
					if (key != "cost_factor" && key != "cost_source") {
						result[key] = Math.round(costs[key] * ordinalCostFactor * statusCostFactor);
					}
				}
			} else {
                if (!this.playerLocationNodes.head) return result;
				var sector = sector || this.playerLocationNodes.head.entity;
				switch(this.getBaseActionID(action)) {
					case "move_camp_level":
                        if (!this.nearestCampNodes.head) return this.getCosts("move_sector_left", 1, 100);
                        var campSector = this.nearestCampNodes.head.entity;
                        var sectorsToMove = Math.abs(sector.get(PositionComponent).sector - campSector.get(PositionComponent).sector);
                        return this.getCosts("move_sector_left", 1, sectorsToMove);
                    
					case "move_camp_global":
						result.stamina = 5 * PlayerActionConstants.costs.move_sector_left.stamina * statusCostFactor;
						break;
					
					case "scout_locale":
						var localei = parseInt(action.split("_")[2]);
						var sectorLocalesComponent = sector.get(SectorLocalesComponent);
						var localeVO = sectorLocalesComponent.locales[localei];
						if(localeVO) return localeVO.costs;
                        break;
                        
                    case "unlock_upgrade":
                        return { blueprint: 1 };
				}
			}
		
			return result;
		},
		
		getDescription: function (action) {
			if (action) {
				var baseAction = this.getBaseActionID(action);
				if (PlayerActionConstants.descriptions[baseAction]) {
					return PlayerActionConstants.descriptions[baseAction];
				} else {
                    switch(baseAction) {
						case "craft":
							var item = this.getItemForCraftAction(action);
							return item.description;
                    }
                }
			}
			return "";
		},
		
		getBaseActionID: function (action) {
			if (!action) return action;
			if (action.indexOf("scout_locale") >= 0) return "scout_locale";
			if (action.indexOf("craft_") >= 0) return "craft";
			if (action.indexOf("unlock_upgrade_") >= 0) return "unlock_upgrade";
			return action;
		},
        
        getActionIDParam: function(action) {
            var remainder = action.replace(this.getBaseActionID(action) + "_", "");
            if (remainder && remainder !== action) return remainder;
            return "";
        },
		
        getImprovementNameForAction: function(action, disableWarnings) {            
            switch(action) {
                case "build_out_collector_food": return improvementNames.collector_food;
                case "build_out_collector_water": return improvementNames.collector_water;
                case "build_in_house": return improvementNames.house;
                case "build_in_storage": return improvementNames.storage;
                case "build_in_hospital": return improvementNames.hospital;
                case "build_in_tradingPost": return improvementNames.tradepost;
                case "build_in_inn": return improvementNames.inn;
                case "build_out_bridge": return improvementNames.bridge;
                case "build_in_campfire": return improvementNames.campfire;
                case "build_in_darkfarm": return improvementNames.darkfarm;
                case "build_in_house2": return improvementNames.house2;
                case "build_in_lights": return improvementNames.lights;
                case "build_in_ceiling": return improvementNames.ceiling;
                case "build_in_apothecary": return improvementNames.apothecary;
                case "build_in_smithy": return improvementNames.smithy;
                case "build_in_cementmill": return improvementNames.cementmill;
                case "build_in_library": return improvementNames.library;
                case "build_in_shrine": return improvementNames.shrine;
                case "build_in_barracks": return improvementNames.barracks;
                case "build_in_fortification": return improvementNames.fortification;
                case "build_in_aqueduct": return improvementNames.aqueduct;
                case "build_in_market": return improvementNames.market;
                case "build_in_radio": return improvementNames.radiotower;
                case "build_in_researchcenter": return improvementNames.researchcenter;
                case "build_out_passage_up_stairs": return improvementNames.passageUpStairs;
                case "build_out_passage_up_elevator": return improvementNames.passageUpElevator;
                case "build_out_passage_up_hole": return improvementNames.passageUpHole;
                case "build_out_passage_down_stairs": return improvementNames.passageDownStairs;
                case "build_out_passage_down_elevator": return improvementNames.passageDownElevator;
                case "build_out_passage_down_hole": return improvementNames.passageDownHole;
                case "build_out_camp": return "";
                
                default:
                    if(!disableWarnings) console.log("WARN: No improvement name found for action " + action);
                    return "";
            }
        },
        
    });
    
    return PlayerActionsHelper;
});